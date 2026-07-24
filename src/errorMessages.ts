// Single source of truth for user-facing Arabic error/status messages.
// The server sends a machine-readable `kind`; the client renders the Arabic text here.
// `empty` and `validation` are UI-only kinds (not thrown by the engine).
export type MessageKind =
  | "auth"
  | "rate_limit"
  | "network"
  | "parse"
  | "unknown"
  | "validation"
  | "empty";

export const ERROR_MESSAGES: Record<Exclude<MessageKind, "empty">, string> = {
  auth: "مفتاح الـ API غير صالح. تحقق من إعدادات مزود الذكاء الاصطناعي.",
  rate_limit: "تم تجاوز حد الطلبات. انتظر لحظات ثم حاول مجدداً.",
  network: "تعذّر الاتصال بمزود الذكاء الاصطناعي. تحقق من اتصالك وحاول مجدداً.",
  parse: "تعذّر تفسير استجابة النموذج. حاول مرة أخرى.",
  unknown: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  validation: "المدخل غير صالح. يجب أن تبدأ الكلمة بحرف عربي.",
};

// Resolves an Arabic message for a given kind. `word` fills the empty-result notice.
export function messageFor(kind: string | null | undefined, word?: string): string {
  if (kind === "empty") {
    return `لا توجد نتائج مطابقة${word ? ` للكلمة "${word}"` : ""} بالفلاتر الحالية. جرّب تخفيف عدد الحروف أو اختيار كلمة أخرى.`;
  }
  return ERROR_MESSAGES[(kind as Exclude<MessageKind, "empty">)] ?? ERROR_MESSAGES.unknown;
}
