import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, ArrowRight, Copy, Check, Trash2, HelpCircle, FileText, Compass, Leaf, Palette } from "lucide-react";
import { ExplorationTree } from "./components/ExplorationTree";

export default function App() {
  const [seedInput, setSeedInput] = useState("");
  const [rootWord, setRootWord] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [copiedWord, setCopiedWord] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dynamic Theme states
  const [currentTheme, setCurrentTheme] = useState("amber"); // defaulting to "amber" (Warm Amber, inspired by the image)
  const [isThemePickerExpanded, setIsThemePickerExpanded] = useState(false);

  const themes = [
    { id: "amber", name: "دافئ عسلي (Amber)", dotClass: "bg-[#D97706]" },
    { id: "slate", name: "هادئ كحلي (Slate)", dotClass: "bg-[#4F46E5]" },
    { id: "emerald", name: "حيوي عشبي (Mint)", dotClass: "bg-[#059669]" },
    { id: "rose", name: "شاعري وردي (Rose)", dotClass: "bg-[#E11D48]" },
  ];

  // Quick Seed Suggestions for immediate play
  const quickSeeds = [
    { word: "روضة", desc: "روضة / حدائق عقارات", icon: "🏡" },
    { word: "قلم", desc: "قلم / أدب وإبداع", icon: "✍️" },
    { word: "بحر", desc: "بحر / شمول وتقنية", icon: "🌊" },
    { word: "شمس", desc: "شمس / طاقة حيوية", icon: "☀️" }
  ];

  const handleStartTree = (word: string) => {
    if (!word.trim()) return;
    setRootWord(word.trim());
    setSelectedWord(null);
    setIsSidebarOpen(false); // keep focused on tree
  };

  const handleSelectWord = (word: string) => {
    setSelectedWord(word);
    if (!favorites.includes(word)) {
      setFavorites(prev => [...prev, word]);
    }
    // Do not auto open sidebar when a word is chosen, keeping user focus on the canvas
  };

  const handleCopy = (word: string) => {
    navigator.clipboard.writeText(word);
    setCopiedWord(word);
    setTimeout(() => setCopiedWord(null), 2000);
  };

  const handleRemoveFavorite = (word: string) => {
    setFavorites(prev => prev.filter(w => w !== word));
    if (selectedWord === word) {
      setSelectedWord(null);
    }
  };

  return (
    <div className={`h-screen w-screen bg-bg-page text-text-main flex flex-col font-sans select-none overflow-hidden theme-${currentTheme}`}>
      
      {/* Main Workspace without header */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        
        <AnimatePresence mode="wait">
          {!rootWord ? (
            /* Onboarding Seed Entry Screen */
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex flex-col items-center justify-center p-6 max-w-xl mx-auto text-center self-center"
            >
              {/* Expandable Theme Switcher inside Onboarding */}
              <div className="mb-6 bg-bg-panel border-2 border-border-main rounded-2xl p-1 flex items-center gap-1 transition-all">
                <button
                  type="button"
                  onClick={() => setIsThemePickerExpanded(!isThemePickerExpanded)}
                  title="تغيير المظهر (Change theme)"
                  className="p-2 hover:bg-bg-page rounded-xl text-text-muted hover:text-accent cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Palette className="w-4 h-4 text-accent" />
                  <span className="text-[11px] font-bold font-sans">تغيير المظهر (Theming)</span>
                </button>

                <AnimatePresence>
                  {isThemePickerExpanded && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-1.5 overflow-hidden pr-2 pl-1 whitespace-nowrap"
                    >
                      {themes.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setCurrentTheme(t.id)}
                          title={t.name}
                          className={`px-2 py-1 rounded-lg text-xs font-bold font-sans border-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                            currentTheme === t.id
                              ? "bg-accent-bg border-accent text-text-main"
                              : "bg-transparent border-transparent hover:bg-bg-page text-text-muted"
                          }`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full ${t.dotClass}`} />
                          <span>{t.id.toUpperCase()}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
                  handleStartTree(seedInput);
                }}
                className="w-full max-w-md flex gap-2 bg-bg-panel p-2 rounded-2xl border-2 border-border-main mb-8"
              >
                <input
                  type="text"
                  placeholder="مثال: روضة، شمس، سحاب..."
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
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

              {/* Quick seed options */}
              <div className="w-full max-w-md">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-4">
                  أفكار سريعة للبدء (Quick Seeds)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {quickSeeds.map((seed) => (
                    <button
                      key={seed.word}
                      type="button"
                      onClick={() => handleStartTree(seed.word)}
                      className="bg-bg-panel hover:bg-bg-page border-2 border-border-main hover:border-accent p-3.5 rounded-2xl text-right cursor-pointer transition-all flex flex-col justify-between group"
                    >
                      <span className="text-xl mb-2 block">{seed.icon}</span>
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
          ) : (
            /* Interactive Tree Screen - Focused fully on React Flow with Slide-out panel */
            <motion.div
              key="workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex relative overflow-hidden h-full"
            >
              
              {/* React Flow viewport canvas */}
              <div className="flex-1 h-full relative">
                <ReactFlowProvider>
                  <ExplorationTree
                    rootWord={rootWord}
                    onSelectWord={handleSelectWord}
                    selectedWord={selectedWord}
                  />
                </ReactFlowProvider>

                {/* Floating Active Seed Info Badge & Back Arrow & Theme Selector */}
                <div className="absolute top-4 left-4 flex flex-col md:flex-row gap-2 z-40 items-start md:items-center">
                  <div className="bg-bg-panel border-2 border-border-main rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
                    <button
                      onClick={() => {
                        setRootWord(null);
                        setSelectedWord(null);
                        setSeedInput("");
                      }}
                      title="جذر جديد (Start new seed)"
                      className="p-1.5 hover:bg-bg-page rounded-xl transition-colors text-text-muted hover:text-text-main cursor-pointer flex items-center justify-center"
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                    </button>
                    <div className="w-[1px] h-4 bg-border-main" />
                    <span className="text-xs font-semibold text-text-muted font-sans">Seed:</span>
                    <span className="font-display font-bold text-sm text-accent bg-accent-bg px-2.5 py-1 rounded-xl border border-accent/25" dir="rtl">
                      {rootWord}
                    </span>
                  </div>

                  {/* Expandable Theme Switcher Widget */}
                  <div className="bg-bg-panel border-2 border-border-main rounded-2xl p-1 flex items-center gap-1 transition-all">
                    <button
                      onClick={() => setIsThemePickerExpanded(!isThemePickerExpanded)}
                      title="تغيير المظهر (Change theme)"
                      className="p-2 hover:bg-bg-page rounded-xl text-text-muted hover:text-accent cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      <Palette className="w-4 h-4 text-accent" />
                      <span className="text-[11px] font-bold font-sans">المظهر</span>
                    </button>

                    <AnimatePresence>
                      {isThemePickerExpanded && (
                        <motion.div
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-center gap-1.5 overflow-hidden pr-2 pl-1 whitespace-nowrap"
                        >
                          {themes.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => setCurrentTheme(t.id)}
                              title={t.name}
                              className={`px-2 py-1 rounded-lg text-xs font-bold font-sans border-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                                currentTheme === t.id
                                  ? "bg-accent-bg border-accent text-text-main"
                                  : "bg-transparent border-transparent hover:bg-bg-page text-text-muted"
                              }`}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${t.dotClass}`} />
                              <span>{t.id.toUpperCase()}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Floating Sidebar Toggle Button (on the right) */}
                <div className="absolute top-4 right-4 z-40">
                  <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="bg-bg-panel hover:bg-bg-page text-text-main font-semibold px-4 py-2.5 rounded-2xl border-2 border-border-main text-xs flex items-center gap-2 cursor-pointer transition-all hover:scale-105"
                  >
                    <div className="w-5 h-5 rounded-lg bg-accent text-white flex items-center justify-center text-[10px] font-bold">
                      {favorites.length}
                    </div>
                    <span dir="rtl" className="font-display font-bold text-text-main">المرشحات</span>
                  </button>
                </div>
              </div>

              {/* Sliding Sidebar for selected candidates & Favorites (sliding out of view) */}
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.div
                    initial={{ x: 320, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 320, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 28 }}
                    className="absolute top-0 right-0 h-full bg-bg-panel border-l-2 border-border-main flex flex-col z-50 shadow-2xl"
                    style={{ width: "320px" }}
                  >
                    <div className="p-5 flex flex-col h-full min-w-[320px]">
                      
                      {/* Sidebar Header */}
                      <div className="flex justify-between items-center mb-6">
                        <button
                          onClick={() => setIsSidebarOpen(false)}
                          className="px-2.5 py-1.5 hover:bg-bg-page border border-border-main rounded-xl transition-colors text-text-muted hover:text-text-main cursor-pointer text-xs font-bold font-sans"
                        >
                          إغلاق ×
                        </button>
                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-accent-bg text-accent font-bold tracking-wider font-sans border border-accent/20">
                          FAVORITES
                        </span>
                      </div>

                      {/* Active selection banner */}
                      <div className="mb-6">
                        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-accent" />
                          <span>الاسم المختار حالياً (Selected Name)</span>
                        </h3>
                        
                        {selectedWord ? (
                          <div className="bg-accent-bg/40 border-2 border-accent rounded-2xl p-4 text-center relative overflow-hidden">
                            <p className="font-display font-black text-3xl text-text-main mb-3" dir="rtl">
                              {selectedWord}
                            </p>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleCopy(selectedWord)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-bg-panel border-2 border-border-main hover:bg-bg-page rounded-xl text-xs font-semibold text-text-main transition-colors cursor-pointer"
                              >
                                {copiedWord === selectedWord ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>تم النسخ</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>نسخ الاسم</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-border-main rounded-2xl p-4 text-center text-xs text-text-muted bg-bg-page/40">
                            اضغط على علامة الصح في أي كلمة لترشيحها كاسم لعلامتك التجارية.
                          </div>
                        )}
                      </div>

                      {/* Favorites Candidates History panel */}
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <Leaf className="w-3.5 h-3.5 text-accent" />
                          <span>الأسماء المرشحة ({favorites.length})</span>
                        </h3>

                        {favorites.length > 0 ? (
                          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                            {favorites.map((favWord) => (
                              <div
                                key={favWord}
                                className={`flex items-center justify-between p-2.5 rounded-xl border-2 transition-colors ${
                                  selectedWord === favWord
                                    ? "bg-accent-bg/30 border-accent"
                                    : "bg-bg-page/50 border-border-main hover:border-accent/40"
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleRemoveFavorite(favWord)}
                                    title="Delete candidate"
                                    className="p-1.5 text-text-muted hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleCopy(favWord)}
                                    title="Copy name"
                                    className="p-1.5 text-text-muted hover:text-text-main rounded-lg hover:bg-bg-page transition-colors cursor-pointer"
                                  >
                                    {copiedWord === favWord ? (
                                      <Check className="w-3.5 h-3.5 text-accent" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                <span
                                  onClick={() => setSelectedWord(favWord)}
                                  className="font-display font-bold text-base text-text-main hover:text-accent cursor-pointer pr-2 transition-colors"
                                  dir="rtl"
                                >
                                  {favWord}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-text-muted text-center py-6 border-2 border-dashed border-border-main rounded-2xl flex-1 flex flex-col items-center justify-center p-4 bg-bg-page/40">
                            <FileText className="w-6 h-6 text-text-muted/40 mb-2" />
                            <p>لم يتم حفظ أي أسماء بعد.</p>
                          </div>
                        )}
                      </div>

                      {/* Footnote on Arabic Lexicon */}
                      <div className="mt-4 pt-4 border-t-2 border-border-main text-[10px] text-text-muted space-y-1.5 shrink-0">
                        <div className="flex items-center gap-1 font-semibold text-text-main">
                          <HelpCircle className="w-3 h-3" />
                          <span>حول نظام الاشتقاق العربي</span>
                        </div>
                        <p dir="rtl" className="text-right leading-relaxed">
                          يعتمد المولد على توسيع الجذور الثلاثية وتطبيق أوزان صرفية قياسية لإنتاج كلمات حية ذات بعد بلاغي وجمالي.
                        </p>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
