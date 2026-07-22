import React, { useEffect } from "react";
import { motion } from "motion/react";
import { ArrowRight, Compass } from "lucide-react";

export interface QuickSeed {
  word: string;
  desc: string;
}

interface LandingPageProps {
  seedInput: string;
  setSeedInput: (value: string) => void;
  onboardingError: string | null;
  setOnboardingError: (value: string | null) => void;
  onStart: (word: string) => void;
  quickSeeds: QuickSeed[];
  // When true, skips the onboarding form entirely and starts the tree immediately
  // with a temporary seed word (defaults to the first quick seed).
  skip?: boolean;
  skipWord?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  seedInput,
  setSeedInput,
  onboardingError,
  setOnboardingError,
  onStart,
  quickSeeds,
  skip = false,
  skipWord,
}) => {
  useEffect(() => {
    if (skip) {
      onStart(skipWord || quickSeeds[0]?.word || "روضة");
    }
    // Only ever run once on mount for the skip shortcut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (skip) {
    return null;
  }

  return (
    <motion.div
      key="onboarding"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 flex flex-col items-center justify-center p-6 max-w-xl mx-auto text-center self-center"
    >
      <div className="w-16 h-16 rounded-3xl bg-accent-bg border-2 border-accent flex items-center justify-center text-accent mb-6">
        <Compass className="w-8 h-8 text-accent animate-spin-slow" />
      </div>

      <h2 className="font-display font-bold text-3xl text-text-main mb-3 tracking-tight">
        مستكشف الأسماء العربي
      </h2>
      <p className="text-sm text-text-muted mb-8 max-w-sm leading-relaxed">
        أدخل كلمة عربية أساسية (جذر أو فكرة دلالية)، وسيقوم مولدنا الذكي بتفريع الأسماء والاشتقاقات عبر الأوزان العربية.
      </p>

      {/* Seed Search Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart(seedInput);
        }}
        className={`w-full max-w-md flex gap-2 bg-bg-panel p-2 rounded-2xl border-2 mb-4 transition-colors ${onboardingError ? "border-rose-500" : "border-border-main"
          }`}
      >
        <input
          type="text"
          placeholder="مثال: روضة، شمس، سحاب..."
          value={seedInput}
          onChange={(e) => {
            setSeedInput(e.target.value);
            if (onboardingError) setOnboardingError(null);
          }}
          className="flex-1 px-4 py-3 text-right font-display font-medium text-text-main placeholder-text-muted bg-transparent border-none outline-none text-base"
          dir="rtl"
        />
        <button
          type="submit"
          disabled={!seedInput.trim()}
          className="px-5 bg-accent hover:bg-accent-hover disabled:bg-border-main disabled:text-text-muted text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-1.5 cursor-pointer border border-secondary"
        >
          <span>استكشف</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {onboardingError && (
        <div className="text-rose-500 text-xs font-semibold mb-6 flex items-center gap-1.5 justify-center" dir="rtl">
          <span>⚠️</span>
          <span>{onboardingError}</span>
        </div>
      )}

      {/* Quick seed options */}
      <div className="w-full max-w-md">
        <div className="grid grid-cols-2 gap-3">
          {quickSeeds.map((seed) => (
            <button
              key={seed.word}
              type="button"
              onClick={() => onStart(seed.word)}
              className="bg-bg-panel hover:bg-bg-page border-2 border-border-main hover:border-accent p-3.5 rounded-2xl text-right cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <p className="font-display font-bold text-text-main group-hover:text-accent transition-colors" dir="rtl">
                  {seed.word}
                </p>
                <p className="text-[10px] text-text-muted leading-tight mt-0.5" dir="rtl">
                  {seed.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
