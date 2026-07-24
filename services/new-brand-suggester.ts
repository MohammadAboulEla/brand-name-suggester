import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";

const DEFAULT_TEXT_MODEL = "gemini-flash-lite-latest";
const MAX_SUGGESTIONS = 5;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Narrow, machine-readable failure categories that flow engine -> API -> client.
// A legitimately empty result is NOT one of these — it stays a valid empty success.
export type LLMErrorKind = "auth" | "rate_limit" | "network" | "parse" | "unknown";

// Typed error thrown by generateJson (and re-thrown by transliterate_word) so the
// API route can map it to an HTTP status + `kind` instead of swallowing it as `null`.
export class LLMError extends Error {
  kind: LLMErrorKind;
  constructor(kind: LLMErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "LLMError";
    this.kind = kind;
  }
}

// Classifies a raw provider/SDK error (OpenAI-compatible or Gemini) into an LLMErrorKind.
function classifyError(error: any): LLMErrorKind {
  const status = error?.status ?? error?.response?.status;
  const code = String(error?.code ?? error?.response?.data?.error?.code ?? "").toLowerCase();

  if (status === 401 || status === 403 || code.includes("invalid_api_key") || code.includes("permission")) {
    return "auth";
  }
  if (status === 429 || code === "429") {
    return "rate_limit";
  }
  if (
    typeof status === "number" && status >= 500 ||
    ["econnrefused", "econnreset", "etimedout", "enotfound", "und_err_connect_timeout"].includes(code) ||
    /fetch failed|network|timeout/i.test(String(error?.message ?? ""))
  ) {
    return "network";
  }
  return "unknown";
}

export interface SuggestedBrand {
  word: string;
  transliteration: string;
}

export interface CrossLingualEcho {
  word: string;
  language: string;
  meaning: string;
}

// Provider selection forwarded from the client's AI Settings modal; when absent
// (or missing a resolvable API key) callers fall back to the default Gemini SDK path.
export interface ProviderRequest {
  baseURL?: string;
  model?: string;
  apiKey?: string;
  envVar?: string;
}

export interface BrandSuggestionParams {
  word: string;
  letter_count?: number | null;
  tone?: string | null;
  mode?: "derivatives" | "plurals" | null;
  provider?: ProviderRequest | null;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

// Basic guard so we don't burn API calls on empty strings, diacritics-only
// input, absurdly long pastes, or obvious prompt-injection attempts. Arabic
// block + spaces + hyphen/apostrophe (for compound entries), capped at 50 chars.
const ARABIC_WORD_RE = /^[\u0600-\u06FF\s'\-]{1,50}$/;

export function isValidArabicWord(word: string): boolean {
  return !!word && ARABIC_WORD_RE.test(word.trim());
}

function resolveOpenAIConfig(provider?: ProviderRequest | null): { apiKey: string; baseURL: string; model: string } | null {
  if (!provider || !provider.baseURL || !provider.model) return null;
  const apiKey = provider.apiKey || (provider.envVar ? process.env[provider.envVar] : undefined);
  if (!apiKey) return null;
  return { apiKey, baseURL: provider.baseURL, model: provider.model };
}

// Runs the prompt through the user-selected OpenAI-compatible provider; returns
// null when no provider is configured so the caller can fall back to Gemini.
async function generateWithProvider(prompt: string, provider: ProviderRequest | null | undefined, temperature?: number): Promise<string | null> {
  const config = resolveOpenAIConfig(provider);
  if (!config) return null;

  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const completion = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    temperature,
  });
  return completion.choices[0]?.message?.content ?? null;
}

// Some OpenAI-compatible providers wrap JSON responses in markdown code fences, or prepend/append
// prose despite instructions not to; strip fences first, then fall back to slicing out the
// outermost [...]/{...} span so stray commentary around valid JSON doesn't break parsing.
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  if (candidate.startsWith("[") || candidate.startsWith("{")) {
    return candidate;
  }

  const arrayStart = candidate.indexOf("[");
  const arrayEnd = candidate.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return candidate.slice(arrayStart, arrayEnd + 1);
  }

  const objectStart = candidate.indexOf("{");
  const objectEnd = candidate.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return candidate.slice(objectStart, objectEnd + 1);
  }

  return candidate;
}

// The model occasionally ignores the "transliteration only" instruction and returns a whole
// paragraph/document. A real transliteration is a short run of Latin letters, so keep only the
// first line, strip anything that isn't A-Z/space/hyphen/apostrophe, and cap the length.
function sanitizeTransliteration(raw: string, fallback: string): string {
  const firstLine = raw.split(/[\r\n]/, 1)[0] ?? "";
  const cleaned = firstLine
    .toUpperCase()
    .replace(/[^A-Z '\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30)
    .trim();
  return cleaned || fallback.toUpperCase();
}

// Removes duplicates (after trimming) and drops any entry identical to the
// original seed word, so the model doesn't just hand the input back to us.
function dedupeExcluding(words: string[], original: string): string[] {
  const seed = original.trim();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of words) {
    const w = String(raw).trim();
    if (!w || w === seed || seen.has(w)) continue;
    seen.add(w);
    result.push(w);
  }
  return result;
}

// Shared "call provider/Gemini -> parse JSON -> retry once on failure" flow used
// by every extraction function below. `schema` is the Gemini responseSchema;
// pass null when using a provider-only flow (schema is only used on the Gemini path).
async function generateJson<T>(
  prompt: string,
  provider: ProviderRequest | null | undefined,
  schema: any,
  temperature: number | undefined,
  label: string,
  attempt = 1
): Promise<T | null> {
  let text: string | null;
  try {
    const providerText = await generateWithProvider(prompt, provider, temperature);
    text = providerText ?? (await (async () => {
      const response = await ai.models.generateContent({
        model: DEFAULT_TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature,
        },
      });
      return response.text ?? null;
    })());
  } catch (error: any) {
    // Retry with backoff on rate limits; every other failure is classified and
    // thrown as a typed LLMError so the API route can surface an accurate message
    // instead of silently collapsing into an empty ("no results") response.
    const kind = classifyError(error);
    if (kind === "rate_limit" && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      return generateJson<T>(prompt, provider, schema, temperature, label, attempt + 1);
    }
    console.error(`Error generating ${label}:`, error);
    throw new LLMError(kind, error?.message);
  }

  if (!text) return null;

  try {
    return JSON.parse(extractJson(text)) as T;
  } catch (error) {
    if (attempt < 2) {
      // One retry with a stricter reminder — small models occasionally wrap
      // output in prose despite instructions.
      const stricterPrompt = `${prompt}\n\nملاحظة مهمة: أعد فقط JSON صالح (valid JSON) دون أي نص إضافي أو تنسيق Markdown.`;
      return generateJson<T>(stricterPrompt, provider, schema, temperature, label, attempt + 1);
    }
    console.error(`Error parsing ${label}:`, error);
    throw new LLMError("parse", "Failed to parse model response as JSON");
  }
}

function extractArray(parsed: any): any[] | null {
  if (Array.isArray(parsed)) return parsed;
  const nested = Object.values(parsed || {}).find(Array.isArray);
  return Array.isArray(nested) ? (nested as any[]) : null;
}

// ---------------------------------------------------------------------------
// Transliteration (single + batch)
// ---------------------------------------------------------------------------

export async function transliterate_word(word: string, provider?: ProviderRequest | null): Promise<string> {
  const prompt = `You are an expert Arabic linguist.
Provide the English pronunciation/transliteration of the Arabic word: "${word}".
Respond ONLY with the transliteration in ALL CAPITAL LETTERS. Do not include any other text, explanation, or punctuation.
Example:
Input: شمس
Output: SHAMS

Input: روضة
Output: RAWDAH`;

  try {
    const providerText = await generateWithProvider(prompt, provider, 0.2);
    const text = providerText ?? (await (async () => {
      const response = await ai.models.generateContent({
        model: DEFAULT_TEXT_MODEL,
        contents: prompt,
        config: { temperature: 0.2 },
      });
      return response.text ?? null;
    })());
    return text ? sanitizeTransliteration(text, word) : word.toUpperCase();
  } catch (e: any) {
    console.error("Transliteration failed:", e);
    // Surface real provider failures (a bad key must not masquerade as a
    // transliteration); fall back to the uppercased word only for benign errors.
    const kind = classifyError(e);
    if (kind === "auth" || kind === "network") throw new LLMError(kind, e?.message);
    return word.toUpperCase();
  }
}

// Transliterates a whole batch of words in a single call instead of one
// round-trip per word — cheaper and faster for the derivatives/plurals modes.
export async function transliterate_words_batch(words: string[], provider?: ProviderRequest | null): Promise<Record<string, string>> {
  if (words.length === 0) return {};

  const prompt = `أنت خبير في اللغة العربية. لكل كلمة عربية في القائمة التالية، قدّم منطوقها/نطقها باللغة الإنجليزية بحروف كابيتال بالكامل (ALL CAPITAL LETTERS).

الكلمات: ${JSON.stringify(words)}

المخرجات يجب أن تكون JSON Array من كائنات، لكل كائن الحقلان "word" (الكلمة العربية) و "transliteration" (النطق بحروف كابيتال)، كما في المثال:
[{"word": "شمس", "transliteration": "SHAMS"}, {"word": "روضة", "transliteration": "RAWDAH"}]`;

  // A map keyed by the Arabic words can't be expressed as a Gemini responseSchema — an OBJECT
  // schema requires statically declared `properties`, so a keys-unknown-ahead-of-time map came
  // back unusable and every word silently fell through to the `w.toUpperCase()` no-op below.
  // Ask for an array of pairs (a shape structured output handles) and rebuild the map here.
  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        word: { type: Type.STRING },
        transliteration: { type: Type.STRING },
      },
      required: ["word", "transliteration"],
    },
    description: "Arabic words paired with their ALL CAPS English transliterations.",
  }, 0.2, "batch transliteration");

  // Accept either the requested array of pairs or a plain {word: transliteration} map, since
  // OpenAI-compatible providers (which ignore the schema entirely) often return the latter.
  const rawMap: Record<string, string> = {};
  const pairs = extractArray(parsed);
  if (pairs) {
    for (const item of pairs) {
      const w = String(item?.word ?? "").trim();
      if (w) rawMap[w] = String(item?.transliteration ?? "");
    }
  } else if (parsed && typeof parsed === "object") {
    for (const [w, translit] of Object.entries(parsed)) {
      rawMap[w.trim()] = String(translit);
    }
  }

  const result: Record<string, string> = {};
  for (const w of words) {
    const raw = rawMap[w.trim()];
    result[w] = raw ? sanitizeTransliteration(raw, w) : w.toUpperCase();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Brand name suggestions (main entry point)
// ---------------------------------------------------------------------------

export async function suggest_brand_names(params: BrandSuggestionParams): Promise<SuggestedBrand[]> {
  const { word, letter_count, tone, mode, provider } = params;

  if (!isValidArabicWord(word)) {
    return [];
  }

  if (mode === "derivatives" || mode === "plurals") {
    const words = mode === "derivatives"
      ? await extractDerivatives(word, provider)
      : await extractPlurals(word, provider);

    const translitMap = await transliterate_words_batch(words, provider);
    return words.map((w) => ({
      word: w,
      transliteration: translitMap[w] ?? w.toUpperCase(),
    }));
  }

  const constraints: string[] = [];
  if (letter_count) {
    constraints.push(`يجب أن تتكون كل كلمة من ${letter_count} حروف بالضبط (بدون احتساب التشكيل)`);
  }
  if (tone) {
    constraints.push(`يجب أن تناسب الطابع/النغمة التالية: ${tone}`);
  }

  const constraintsText = constraints.length > 0
    ? constraints.map((c) => `- ${c}`).join('\n')
    : '- لا قيود إضافية';

  const prompt = `أنت خبير في اللغة العربية وتسمية العلامات التجارية (Branding).
الكلمة الأساسية: "${word}"

المطلوب: اقترح ${MAX_SUGGESTIONS} كلمات عربية بديلة ومبتكرة تصلح كاسم براند.

تنبيه هام جداً للتنوع:
لا تكتفِ بتوليد المشتقات الصرفية المباشرة للكلمة فقط (مثل: بحر -> بحري، بحارة).
يجب أن تتوزع المقترحات كالتالي لضمان التنوع الدلالي:
1. مرادفات وكلمات تنتمي لنفس الحقل الدلالي/المفهوم (مثل: محيط، لؤلؤ، مرجان، موج، أفق).
2. مشتقات لغوية مبتكرة أو جذور قريبة.
3. استعارات أو رموز ترتبط بالكلمة معنوياً.

لكل كلمة مقترحة باللغة العربية، يرجى تقديم منطوقها/نطقها باللغة الإنجليزية في حروف كابيتال بالكامل (All Capital Letters) مثل "SHAMS" للكلمة "شمس" أو "RAWD" للكلمة "روض".

الشروط الإضافية:
${constraintsText}

المخرجات يجب أن تكون عبارة عن JSON Array مكون من ${MAX_SUGGESTIONS} كائنات، يحتوي كل كائن على الحقول "word" و "transliteration" كما في المثال التالي:
[
  {"word": "محيط", "transliteration": "MUHEET"},
  {"word": "أفق", "transliteration": "OFUQ"}
]`;

  const parsed = await generateJson<any[]>(prompt, provider, {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        word: { type: Type.STRING },
        transliteration: { type: Type.STRING }
      },
      required: ["word", "transliteration"]
    },
    description: `List of ${MAX_SUGGESTIONS} Arabic brand name suggestions with English transliterations`,
  }, 0.8, "brand name suggestions");

  if (!parsed) return [];

  const mapped = parsed.map((item: any) => {
    const w = String(item.word || "").trim();
    return {
      word: w,
      transliteration: sanitizeTransliteration(String(item.transliteration || ""), w),
    };
  }).filter((item) => item.word);

  const deduped = dedupeExcluding(mapped.map((m) => m.word), word);
  return mapped
    .filter((m) => deduped.includes(m.word))
    .filter((m, i, arr) => arr.findIndex((x) => x.word === m.word) === i)
    .slice(0, MAX_SUGGESTIONS);
}

// ---------------------------------------------------------------------------
// Morphological extraction functions
// ---------------------------------------------------------------------------

/**
 * Extracts morphological derivatives (مشتقات صرفية) derived from the root/seed word.
 * (e.g., "بحر" -> ["بَحّار", "بَحري", "إبحار", "مَبحر", "بُحيرة"])
 *
 * @param word - seed Arabic word (required), e.g. "بحر"
 * @returns Up to MAX_SUGGESTIONS valid Arabic derivatives (plain strings), deduped.
 */
export async function extractDerivatives(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير في علم الصرف واللغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: استخرج المشتقات الصرفية الصحيحة المأخوذة من نفس جذر هذه الكلمة (مثل: اسم الفاعل، اسم المفعول، المصدر، صيغ المبالغة، اسم المكان/الزمان، اسم الآلة، التصغير).

الشروط:
- أعد الكلمات مجردة وبدون شرح.
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} مشتقات كحد أقصى (Up to ${MAX_SUGGESTIONS} words).
- تأكد من صحة الوزن الصرفي للكلمات الناتجة.

المخرجات يجب أن تكون عبارة عن JSON Array من النصوص فقط، بدون أي شرح أو نص إضافي، كما في المثال التالي:
["بَحّار", "بَحري", "إبحار"]`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: `List of up to ${MAX_SUGGESTIONS} morphological derivatives in Arabic.`,
  }, 0.3, "derivatives");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Extracts valid plural forms (جموع الكلمة) for the seed word.
 * (e.g., "بحر" -> ["بحور", "بحار", "أبحر"])
 *
 * @param word - seed Arabic word (required), e.g. "بحر"
 * @returns Up to MAX_SUGGESTIONS valid Arabic plural forms (plain strings), deduped.
 */
export async function extractPlurals(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير في علم النحو والصرف للغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: استخرج صيغ الجمع الصحيحة والمثبتة في المعاجم لهذه الكلمة (سواء جمع تكسير، جمع مذكر سالم، جمع مؤنث سالم، أو جموع الكثرة والقلة).

الشروط:
- أعد الكلمات مجردة وبدون شرح.
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} صيغ جمع كحد أقصى (Up to ${MAX_SUGGESTIONS} words). إذا لم يكن للكلمة إلا جمع واحد أو اثنين صحيحين، اكتفِ بهما فقط ولا تختلق جموعاً خاطئة.

المخرجات يجب أن تكون عبارة عن JSON Array من النصوص فقط، بدون أي شرح أو نص إضافي، كما في المثال التالي:
["رياض", "روضات"]`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: `List of up to ${MAX_SUGGESTIONS} valid Arabic plural forms.`,
  }, 0.3, "plurals");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Extracts the 3/4-letter root (جذر) of the word, e.g. "بحّار" -> "ب ح ر".
 */
export async function extractRoot(word: string, provider?: ProviderRequest | null): Promise<string | null> {
  if (!isValidArabicWord(word)) return null;

  const prompt = `أنت خبير في علم الصرف العربي.
الكلمة: "${word}"

المطلوب: استخرج الجذر اللغوي (الحروف الأصلية) لهذه الكلمة فقط.

المخرجات يجب أن تكون JSON Object بحقل واحد "root" يحتوي على حروف الجذر مفصولة بمسافات، كما في المثال:
{"root": "ب ح ر"}`;

  const parsed = await generateJson<{ root?: string }>(prompt, provider, {
    type: Type.OBJECT,
    properties: { root: { type: Type.STRING } },
    required: ["root"],
  }, 0.1, "root extraction");

  const root = parsed?.root?.trim();
  return root || null;
}

/**
 * Extracts true synonyms (مرادفات) — distinct from derivatives, these are
 * different words that share the same meaning rather than the same root.
 */
export async function extractSynonyms(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير معجمي في اللغة العربية.
الكلمة: "${word}"

المطلوب: اذكر مرادفات حقيقية لهذه الكلمة (كلمات مختلفة الجذر لكنها تحمل نفس المعنى تقريباً)، وليس مشتقات من نفس الجذر.

الشروط:
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} مرادفات.
- إذا لم توجد مرادفات دقيقة، أعد مصفوفة فارغة.

المخرجات يجب أن تكون JSON Array من النصوص فقط، مثل:
["محيط", "لجّة"]`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: `List of up to ${MAX_SUGGESTIONS} true Arabic synonyms.`,
  }, 0.4, "synonyms");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Extracts antonyms (أضداد) — occasionally useful for contrast-themed branding.
 */
export async function extractAntonyms(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير معجمي في اللغة العربية.
الكلمة: "${word}"

المطلوب: اذكر كلمات تحمل معنى مضاداً (أضداد) لهذه الكلمة، إن وجدت.

الشروط:
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} أضداد.
- إذا لم يكن لهذه الكلمة ضد منطقي، أعد مصفوفة فارغة ولا تختلق كلمات.

المخرجات يجب أن تكون JSON Array من النصوص فقط.`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: `List of up to ${MAX_SUGGESTIONS} Arabic antonyms, if any exist.`,
  }, 0.3, "antonyms");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Extracts the nisba/relative-adjective form (اسم النسب), e.g. "بحر" -> "بحري".
 * A very common pattern in real-world Arabic brand names.
 */
export async function extractNisba(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير في علم الصرف العربي.
الكلمة: "${word}"

المطلوب: استخرج صيغة/صيغ اسم النسب (Relative adjective) الصحيحة لهذه الكلمة (بإضافة ياء النسب المشددة)، مثل: بحر -> بحري.

الشروط:
- أعد صيغة واحدة أو أكثر إن وُجد أكثر من احتمال صحيح لغوياً (حد أقصى ${MAX_SUGGESTIONS}).
- لا تختلق صيغاً غير صحيحة صرفياً.

المخرجات يجب أن تكون JSON Array من النصوص فقط.`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: "List of valid nisba (relative adjective) forms.",
  }, 0.2, "nisba");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Extracts Arabic words that rhyme with the seed word — useful once a brand
 * name is chosen and the client wants a matching slogan/tagline.
 */
export async function extractRhymes(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير في العروض والقوافي العربية.
الكلمة: "${word}"

المطلوب: اقترح كلمات عربية شائعة تنتهي بنفس القافية/الوزن الصوتي لهذه الكلمة، بحيث تصلح لبناء شعار أو جملة تسويقية (Tagline) متناغمة صوتياً.

الشروط:
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} كلمات.
- يجب أن تكون الكلمات مفهومة ومستخدمة فعلياً في اللغة العربية.

المخرجات يجب أن تكون JSON Array من النصوص فقط.`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: `List of up to ${MAX_SUGGESTIONS} Arabic words rhyming with the seed word.`,
  }, 0.6, "rhymes");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Suggests two-word compound brand names built around the seed word
 * (e.g. "بحر" -> "بحر النور", "بحر الأمل") — a common pattern in modern
 * Gulf/MENA branding.
 */
export async function suggestCompoundNames(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير في تسمية العلامات التجارية باللغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: اقترح أسماء براند مركبة من كلمتين تتضمن هذه الكلمة (أو أحد مشتقاتها القريبة)، بأسلوب شائع في تسمية العلامات التجارية الخليجية/العربية الحديثة (مثل: "بحر النور"، "بحر الأمل").

الشروط:
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} أسماء مركبة.
- يجب أن تكون الأسماء سلسة النطق ومناسبة للاستخدام التجاري.

المخرجات يجب أن تكون JSON Array من النصوص فقط.`;

  const parsed = await generateJson<any>(prompt, provider, {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: `List of up to ${MAX_SUGGESTIONS} two-word compound brand names.`,
  }, 0.7, "compound names");

  const names = extractArray(parsed);
  if (!names) return [];
  return dedupeExcluding(names.map(String), word).slice(0, MAX_SUGGESTIONS);
}

/**
 * Finds words in other languages whose sound (via the transliteration) happens
 * to echo the Arabic word — a nice differentiator for brands aiming to work
 * well internationally too.
 */
export async function crossLingualEcho(word: string, provider?: ProviderRequest | null): Promise<CrossLingualEcho[]> {
  if (!isValidArabicWord(word)) return [];

  const prompt = `أنت خبير لغوي متعدد اللغات ومتخصص في تسمية العلامات التجارية العالمية.
الكلمة العربية: "${word}"

المطلوب: ابحث عن كلمات في لغات أخرى (إنجليزية، فرنسية، إسبانية، إيطالية، يابانية...إلخ) يتشابه نطقها صوتياً مع نطق هذه الكلمة العربية، وتحمل معنى إيجابياً أو محايداً (تجنب أي كلمة سلبية أو مسيئة).

الشروط:
- أعد ما يصل إلى 3 نتائج فقط.
- إذا لم يوجد تشابه صوتي حقيقي ومفيد، أعد مصفوفة فارغة، ولا تختلق تشابهاً ضعيفاً.

المخرجات يجب أن تكون JSON Array من كائنات بالحقول "word" و "language" و "meaning"، كما في المثال:
[{"word": "Sham", "language": "English (informal)", "meaning": "a playful trick"}]`;

  const parsed = await generateJson<any[]>(prompt, provider, {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        word: { type: Type.STRING },
        language: { type: Type.STRING },
        meaning: { type: Type.STRING },
      },
      required: ["word", "language", "meaning"],
    },
    description: "List of up to 3 cross-lingual phonetic echoes with meaning and source language.",
  }, 0.6, "cross-lingual echo");

  if (!parsed || !Array.isArray(parsed)) return [];
  return parsed
    .map((item) => ({
      word: String(item.word || "").trim(),
      language: String(item.language || "").trim(),
      meaning: String(item.meaning || "").trim(),
    }))
    .filter((item) => item.word && item.language)
    .slice(0, 3);
}

/**
 * Returns a short dictionary-style definition of the word — useful for
 * showing "why this word" context in the UI next to a suggestion.
 */
export async function extractDefinition(word: string, provider?: ProviderRequest | null): Promise<string | null> {
  if (!isValidArabicWord(word)) return null;

  const prompt = `أنت معجمي متخصص في اللغة العربية.
الكلمة: "${word}"

المطلوب: قدّم تعريفاً معجمياً موجزاً (جملة واحدة أو جملتين كحد أقصى) لهذه الكلمة.

المخرجات يجب أن تكون JSON Object بحقل واحد "definition"، كما في المثال:
{"definition": "المسطح المائي الواسع المالح."}`;

  const parsed = await generateJson<{ definition?: string }>(prompt, provider, {
    type: Type.OBJECT,
    properties: { definition: { type: Type.STRING } },
    required: ["definition"],
  }, 0.2, "definition");

  const def = parsed?.definition?.trim();
  return def || null;
}