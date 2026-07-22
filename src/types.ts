export interface BrandNodeData {
  word: string;
  transliteration?: string;
  root?: string;
  tone?: string | null;
  letter_count?: number | null;
  loading: boolean;
  expanded: boolean;
  isRoot?: boolean;
  parentId?: string | null;
  selected?: boolean;
  isFavorite?: boolean;
  autoEdit?: boolean;
  onExpand: (nodeId: string, constraints: { letter_count: number | null; tone: string | null; mode?: "derivatives" | "plurals" | null }) => void;
  onSelect: (word: string, nodeId: string) => void;
  onRegenerate?: (nodeId: string, constraints: { letter_count: number | null; tone: string | null; mode?: "derivatives" | "plurals" | null }) => void;
  onEditWord?: (nodeId: string, newWord: string) => boolean;
}

export type TonePreset = {
  id: string;
  label: string;
  emoji: string;
  description: string;
};

export const TONE_PRESETS: TonePreset[] = [
  { id: "tech", label: "حديث وتقني (Modern)", emoji: "⚡", description: "طابع مستقبلي ورقمي متميز" },
  { id: "elegant", label: "أنيق وفاخر (Elegant)", emoji: "✨", description: "طابع راقٍ، فخم وجذاب" },
  { id: "poetic", label: "شاعري وأصيل (Poetic)", emoji: "🌿", description: "كلاسيكي، ذو نغمة عربية عميقة ورائعة" },
  { id: "playful", label: "مرح وودي (Playful)", emoji: "🎈", description: "طابع دافئ، نشيط وشاب" },
  { id: "corporate", label: "رسمي (Corporate)", emoji: "🏢", description: "طابع مهني وموثوق ومستقر" },
];
