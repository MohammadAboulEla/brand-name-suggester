import { Sparkles, AlertTriangle } from "lucide-react";

export type BannerSeverity = "info" | "error";
export type BannerState = { text: string; severity: BannerSeverity } | null;

// Absolute-positioned status banner: red for failures, accent for neutral
// notices (empty result, nothing saved, etc.). Renders nothing when banner is null.
export function StatusBanner({ banner, onClose }: { banner: BannerState; onClose: () => void }) {
  if (!banner) return null;
  const isError = banner.severity === "error";

  return (
    <div dir="rtl" className={`
      absolute flex
      gap-2 items-center
      max-w-lg
      px-4 py-3
      text-text-main text-xs text-right
      border-2 rounded-2xl
      md:-translate-x-1/2 md:left-1/2 md:right-auto
      left-4 right-4 top-4 z-50
      ${isError ? "bg-red-500/10 border-red-500" : "bg-accent-bg border-accent"}
    `}>
      {isError
        ? <AlertTriangle className="h-4 shrink-0 w-4 text-red-500" />
        : <Sparkles className="h-4 shrink-0 w-4 text-accent" />}
      <span className="
        font-medium
      ">{banner.text}</span>
      <button
        onClick={onClose}
        className={`
          ml-auto px-1
          font-bold text-xl leading-none
          ${isError ? "text-red-500 hover:text-red-600" : "text-accent hover:text-accent-hover"}
        `}
      >
        ×
      </button>
    </div>
  );
}
