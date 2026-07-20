import { GoogleGenAI, Type } from "@google/genai";

const DEFAULT_TEXT_MODEL = "gemini-3.1-flash-lite";

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

export interface BrandSuggestionParams {
  word: string;
  letter_count?: number | null;
  tone?: string | null;
  mode?: "derivatives" | "plurals" | null;
}

export async function suggest_brand_names(params: BrandSuggestionParams): Promise<SuggestedBrand[]> {
  const { word, letter_count, tone, mode } = params;

  if (!word || !word.trim()) {
    return [];
  }

  // If we are in derivatives or plurals extraction mode, use the specific functions
  if (mode === "derivatives") {
    try {
      const derivedWords = await extractDerivatives(word);
      const suggestions = await Promise.all(
        derivedWords.map(async (w) => {
          const translit = await transliterate_word(w);
          return {
            word: w,
            transliteration: translit,
          };
        })
      );
      return suggestions;
    } catch (error) {
      console.error("Error in derivatives path:", error);
      return [];
    }
  }

  if (mode === "plurals") {
    try {
      const pluralWords = await extractPlurals(word);
      const suggestions = await Promise.all(
        pluralWords.map(async (w) => {
          const translit = await transliterate_word(w);
          return {
            word: w,
            transliteration: translit,
          };
        })
      );
      return suggestions;
    } catch (error) {
      console.error("Error in plurals path:", error);
      return [];
    }
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

المطلوب: اقترح 6 كلمات عربية بديلة ومبتكرة تصلح كاسم براند.

تنبيه هام جداً للتنوع:
لا تكتفِ بتوليد المشتقات الصرفية المباشرة للكلمة فقط (مثل: بحر -> بحري، بحارة).
يجب أن تتوزع المقترحات كالتالي لضمان التنوع الدلالي:
1. مرادفات وكلمات تنتمي لنفس الحقل الدلالي/المفهوم (مثل: محيط، لؤلؤ، مرجان، موج، أفق).
2. مشتقات لغوية مبتكرة أو جذور قريبة.
3. استعارات أو رموز ترتبط بالكلمة معنوياً.

لكل كلمة مقترحة باللغة العربية، يرجى تقديم منطوقها/نطقها باللغة الإنجليزية في حروف كابيتال بالكامل (All Capital Letters) مثل "SHAMS" للكلمة "شمس" أو "RAWD" للكلمة "روض".

الشروط الإضافية:
${constraintsText}

المخرجات يجب أن تكون عبارة عن JSON Array مكون من 6 كائنات، يحتوي كل كائن على الحقول "word" و "transliteration" كما في المثال التالي:
[
  {"word": "محيط", "transliteration": "MUHEET"},
  {"word": "أفق", "transliteration": "OFUQ"}
]`;

  try {
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
          description: "List of 6 Arabic brand name suggestions with English transliterations",
        },
        temperature: 0.8,
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          word: String(item.word || "").trim(),
          transliteration: String(item.transliteration || "").trim().toUpperCase()
        })).filter(item => item.word).slice(0, 6);
      }
    }
    return [];
  } catch (error) {
    console.error("Error generating brand name suggestions:", error);
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
export async function extractDerivatives(word: string): Promise<string[]> {
  const prompt = `أنت خبير في علم الصرف واللغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: استخرج المشتقات الصرفية الصحيحة المأخوذة من نفس جذر هذه الكلمة (مثل: اسم الفاعل، اسم المفعول، المصدر، صيغ المبالغة، اسم المكان/الزمان، اسم الآلة، التصغير).

الشروط:
- أعد الكلمات مجردة وبدون شرح.
- يمكنك إرجاع ما يصل إلى 6 مشتقات كحد أقصى (Up to 6 words).
- تأكد من صحة الوزن الصرفي للكلمات الناتجة.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
          description: 'List of up to 6 morphological derivatives in Arabic.',
        },
      },
    });

    if (response.text) {
      const names = JSON.parse(response.text);
      if (Array.isArray(names)) {
        return names.slice(0, 6).map((n) => String(n));
      }
    }
    return [];
  } catch (error) {
    console.error('Error extracting derivatives:', error);
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
export async function extractPlurals(word: string): Promise<string[]> {
  const prompt = `أنت خبير في علم النحو والصرف للغة العربية.
الكلمة الأساسية: "${word}"

المطلوب: استخرج صيغ الجمع الصحيحة والمثبتة في المعاجم لهذه الكلمة (سواء جمع تكسير، جمع مذكر سالم، جمع مؤنث سالم، أو جموع الكثرة والقلة).

الشروط:
- أعد الكلمات مجردة وبدون شرح.
- يمكنك إرجاع ما يصل إلى 6 صيغ جمع كحد أقصى (Up to 6 words). إذا لم يكن للكلمة إلا جمع واحد أو اثنين صحيحين، اكتفِ بهما فقط ولا تختلق جموعاً خاطئة.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
          description: 'List of up to 6 valid Arabic plural forms.',
        },
      },
    });

    if (response.text) {
      const names = JSON.parse(response.text);
      if (Array.isArray(names)) {
        return names.slice(0, 6).map((n) => String(n));
      }
    }
    return [];
  } catch (error) {
    console.error('Error extracting plurals:', error);
    return [];
  }
}

export async function transliterate_word(word: string): Promise<string> {
  const prompt = `You are an expert Arabic linguist.
Provide the English pronunciation/transliteration of the Arabic word: "${word}".
Respond ONLY with the transliteration in ALL CAPITAL LETTERS. Do not include any other text, explanation, or punctuation.
Example:
Input: شمس
Output: SHAMS

Input: روضة
Output: RAWDAH`;

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_TEXT_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });
    return response.text ? response.text.trim().toUpperCase() : word.toUpperCase();
  } catch (e) {
    console.error("Transliteration failed:", e);
    return word.toUpperCase();
  }
}
