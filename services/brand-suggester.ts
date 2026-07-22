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

export interface SuggestedBrand {
  word: string;
  transliteration: string;
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

export async function suggest_brand_names(params: BrandSuggestionParams): Promise<SuggestedBrand[]> {
  const { word, letter_count, tone, mode, provider } = params;

  if (!word || !word.trim()) {
    return [];
  }

  // If we are in derivatives or plurals extraction mode, use the specific functions
  if (mode === "derivatives") {
    const derivedWords = await extractDerivatives(word, provider);
    return Promise.all(
      derivedWords.map(async (w) => {
        const translit = await transliterate_word(w, provider);
        return {
          word: w,
          transliteration: translit,
        };
      })
    );
  }

  if (mode === "plurals") {
    const pluralWords = await extractPlurals(word, provider);
    return Promise.all(
      pluralWords.map(async (w) => {
        const translit = await transliterate_word(w, provider);
        return {
          word: w,
          transliteration: translit,
        };
      })
    );
  }

  const constraints: string[] = [];
  if (letter_count) {
    constraints.push(
      `يجب أن تتكون كل كلمة من ${letter_count} حروف بالضبط (بدون احتساب التشكيل)`
    );
  }
  if (tone) {
    constraints.push(`يجب أن تناسب الطابع/النغمة التالية: ${tone}`);
  }

  const constraintsText =
    constraints.length > 0
      ? constraints.map((c) => `- ${c}`).join('\n')
      : '- لا قيود إضافية';

  // تحسين الـ Prompt لفرض التنوع وعدم الاقتصار على الاشتقاق الصرفي المباشر
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

  const providerText = await generateWithProvider(prompt, provider, 0.8);
  const text = providerText ?? (await (async () => {
    const response = await ai.models.generateContent({
      model: DEFAULT_TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
        },
        temperature: 0.8,
      },
    });
    return response.text ?? null;
  })());

  try {
    if (text) {
      const parsed = JSON.parse(extractJson(text));
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
          const w = String(item.word || "").trim();
          return {
            word: w,
            transliteration: sanitizeTransliteration(String(item.transliteration || ""), w)
          };
        }).filter(item => item.word).slice(0, MAX_SUGGESTIONS);
      }
    }
    return [];
  } catch (error) {
    console.error("Error parsing brand name suggestions:", error);
    return [];
  }
}

/**
 * Extracts morphological derivatives (مشتقات صرفية) derived from the root/seed word.
 * (e.g., "بحر" -> ["بَحّار", "بَحري", "إبحار", "مَبحر", "بُحيرة"])
 *
 * @param word - seed Arabic word (required), e.g. "بحر"
 * @returns A list of up to 6 valid Arabic derivatives (plain strings).
 */
export async function extractDerivatives(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  const prompt = `أنت خبير في علم الصرف واللغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: استخرج المشتقات الصرفية الصحيحة المأخوذة من نفس جذر هذه الكلمة (مثل: اسم الفاعل، اسم المفعول، المصدر، صيغ المبالغة، اسم المكان/الزمان، اسم الآلة، التصغير).

الشروط:
- أعد الكلمات مجردة وبدون شرح.
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} مشتقات كحد أقصى (Up to ${MAX_SUGGESTIONS} words).
- تأكد من صحة الوزن الصرفي للكلمات الناتجة.

المخرجات يجب أن تكون عبارة عن JSON Array من النصوص فقط، بدون أي شرح أو نص إضافي، كما في المثال التالي:
["بَحّار", "بَحري", "إبحار"]`;

  const providerText = await generateWithProvider(prompt, provider);
  const text = providerText ?? (await (async () => {
    const response = await ai.models.generateContent({
      model: DEFAULT_TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
          description: `List of up to ${MAX_SUGGESTIONS} morphological derivatives in Arabic.`,
        },
      },
    });
    return response.text ?? null;
  })());

  try {
    if (text) {
      const parsed = JSON.parse(extractJson(text));
      const names = Array.isArray(parsed) ? parsed : Object.values(parsed || {}).find(Array.isArray);
      if (Array.isArray(names)) {
        return names.slice(0, MAX_SUGGESTIONS).map((n) => String(n));
      }
      console.error('Error extracting derivatives: response was not an array', text);
    }
    return [];
  } catch (error) {
    console.error('Error parsing derivatives:', error);
    return [];
  }
}

/**
 * Extracts valid plural forms (جموع الكلمة) for the seed word.
 * (e.g., "بحر" -> ["بحور", "بحار", "أبحر"])
 *
 * @param word - seed Arabic word (required), e.g. "بحر"
 * @returns A list of up to 6 valid Arabic plural forms (plain strings).
 */
export async function extractPlurals(word: string, provider?: ProviderRequest | null): Promise<string[]> {
  const prompt = `أنت خبير في علم النحو والصرف للغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: استخرج صيغ الجمع الصحيحة والمثبتة في المعاجم لهذه الكلمة (سواء جمع تكسير، جمع مذكر سالم، جمع مؤنث سالم، أو جموع الكثرة والقلة).

الشروط:
- أعد الكلمات مجردة وبدون شرح.
- يمكنك إرجاع ما يصل إلى ${MAX_SUGGESTIONS} صيغ جمع كحد أقصى (Up to ${MAX_SUGGESTIONS} words). إذا لم يكن للكلمة إلا جمع واحد أو اثنين صحيحين، اكتفِ بهما فقط ولا تختلق جموعاً خاطئة.

المخرجات يجب أن تكون عبارة عن JSON Array من النصوص فقط، بدون أي شرح أو نص إضافي، كما في المثال التالي:
["رياض", "روضات"]`;

  const providerText = await generateWithProvider(prompt, provider);
  const text = providerText ?? (await (async () => {
    const response = await ai.models.generateContent({
      model: DEFAULT_TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
          description: `List of up to ${MAX_SUGGESTIONS} valid Arabic plural forms.`,
        },
      },
    });
    return response.text ?? null;
  })());

  try {
    if (text) {
      const parsed = JSON.parse(extractJson(text));
      const names = Array.isArray(parsed) ? parsed : Object.values(parsed || {}).find(Array.isArray);
      if (Array.isArray(names)) {
        return names.slice(0, MAX_SUGGESTIONS).map((n) => String(n));
      }
      console.error('Error extracting plurals: response was not an array', text);
    }
    return [];
  } catch (error) {
    console.error('Error parsing plurals:', error);
    return [];
  }
}

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
        config: {
          temperature: 0.2,
        },
      });
      return response.text ?? null;
    })());
    return text ? sanitizeTransliteration(text, word) : word.toUpperCase();
  } catch (e) {
    console.error("Transliteration failed:", e);
    return word.toUpperCase();
  }
}