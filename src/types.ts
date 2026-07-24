export type SuggestionMode =
  | "derivatives"
  | "plurals"
  | "synonyms"
  | "antonyms"
  | "nisba"
  | "rhymes"
  | "compounds";

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
  isCompactMoreMenu?: boolean;
  onExpand: (nodeId: string, constraints: { letter_count: number | null; tone: string | null; mode?: SuggestionMode | null }) => void;
  onSelect: (word: string, nodeId: string) => void;
  onRegenerate?: (nodeId: string, constraints: { letter_count: number | null; tone: string | null; mode?: SuggestionMode | null }) => void;
  onEditWord?: (nodeId: string, newWord: string) => boolean;
}

// Intermediate labelled node inserted between a parent and a mode's result set
// (e.g. "معاني" for synonyms). Renders as a rounded accent rectangle with a
// collapse/expand dot that hides/shows its result subtree.
export interface GroupNodeData {
  nodeKind: "group";
  label: string;
  mode: SuggestionMode;
  parentId?: string | null;
  collapsed: boolean;
  onToggleCollapse?: (groupId: string) => void;
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
