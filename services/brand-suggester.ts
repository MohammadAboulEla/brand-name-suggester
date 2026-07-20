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
}

export async function suggest_brand_names(params: BrandSuggestionParams): Promise<SuggestedBrand[]> {
  const { word, letter_count, tone } = params;

  if (!word || !word.trim()) {
    return [];
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
