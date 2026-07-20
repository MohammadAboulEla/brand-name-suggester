import React, { useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Calendar, Heart, ChevronDown, RefreshCw, Type, Hash, GitFork, Layers, Check } from "lucide-react";
import { BrandNodeData, TONE_PRESETS, TonePreset } from "../types";
import { Tooltip } from "./Tooltip";

export const BrandNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as BrandNodeData;
  const { word, loading, expanded, isRoot, selected, onExpand, onSelect, onRegenerate, onEditWord } = nodeData;

  const [isHovered, setIsHovered] = useState(false);
  const [showLetterMenu, setShowLetterMenu] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);

  // Local constraints set via satellite circles before expansion
  const [letterCount, setLetterCount] = useState<number | null>(null);
  const [tone, setTone] = useState<string | null>(null);
  const [extractionMode, setExtractionMode] = useState<"derivatives" | "plurals" | null>(null);

  const [localTransliteration, setLocalTransliteration] = useState<string>("");
  
  // Word inline editing states
  const [isEditingWord, setIsEditingWord] = useState(false);
  const [editWordValue, setEditWordValue] = useState(word);
  
  // Manual custom tone state
  const [customToneInput, setCustomToneInput] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditWordValue(word);
  }, [word]);

  // Fetch or resolve English transliteration of the Arabic word
  useEffect(() => {
    if (nodeData.transliteration) {
      setLocalTransliteration(nodeData.transliteration);
      return;
    }

    const QUICK_SEEDS_TRANSLITERATION: Record<string, string> = {
      "روضة": "RAWDAH",
      "روض": "RAWD",
      "قلم": "QALAM",
      "بحر": "BAHR",
      "شمس": "SHAMS",
    };

    if (QUICK_SEEDS_TRANSLITERATION[word]) {
      setLocalTransliteration(QUICK_SEEDS_TRANSLITERATION[word]);
      return;
    }

    let isMounted = true;
    const fetchTransliteration = async () => {
      try {
        const res = await fetch("/api/transliterate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word }),
        });
        const json = await res.json();
        if (json.success && isMounted) {
          setLocalTransliteration(json.transliteration);
        }
      } catch (e) {
        console.error("Failed to fetch transliteration:", e);
      }
    };
    fetchTransliteration();
    return () => {
      isMounted = false;
    };
  }, [word, nodeData.transliteration]);

  // Handle clicking outside to close satellite option overlays
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowLetterMenu(false);
        setShowToneMenu(false);
        setIsHovered(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, { capture: true });
    };
  }, []);

  const currentTonePreset = TONE_PRESETS.find((t) => t.id === tone);

  const handleMainClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading || expanded || isEditingWord) return;
    onExpand(id, { letter_count: letterCount, tone, mode: extractionMode });
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(word, id);
  };

  const handleRegenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerate) {
      onRegenerate(id, { letter_count: letterCount, tone, mode: extractionMode });
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingWord(!isEditingWord);
    setIsHovered(false);
  };

  const letterOptions = [null, 3, 4, 5, 6];

  return (
    <div
      ref={containerRef}
      className="relative p-4 select-none"
      onMouseEnter={() => {
        if (!isEditingWord) setIsHovered(true);
      }}
      onMouseLeave={() => {
        // Only hide if menus aren't actively open
        if (!showLetterMenu && !showToneMenu) {
          setIsHovered(false);
        }
      }}
    >
      {/* Target handle for incoming parent lines (centered behind the node) */}
      <Handle
        type="target"
        position={Position.Top}
        className="opacity-0 w-1 h-1 pointer-events-none"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      {/* Source handle for outgoing children lines (centered behind the node) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="opacity-0 w-1 h-1 pointer-events-none"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      {/* Satellites Orbit Group */}
      <AnimatePresence>
        {(isHovered || showLetterMenu || showToneMenu) && !isEditingWord && (
          <div className="absolute inset-0 pointer-events-none z-[100]">
            
            {/* Satellite 1: Letter Count (Top Left) - Uses Hash icon for number count */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: -54, y: -54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`absolute left-1/2 top-1/2 pointer-events-auto transition-all ${showLetterMenu ? 'z-50' : 'z-10 hover:z-50'}`}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2">
                <Tooltip content="تحديد عدد الحروف" position="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLetterMenu(!showLetterMenu);
                      setShowToneMenu(false);
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
                      letterCount 
                        ? "bg-accent text-white border-secondary scale-110" 
                        : "bg-bg-panel text-text-muted border-border-main hover:bg-bg-page hover:text-text-main"
                    }`}
                  >
                    <Hash className="w-4 h-4" />
                  </button>
                </Tooltip>

                {/* Letter Options Popover - appears below the satellite icon */}
                <AnimatePresence>
                  {showLetterMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 22 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className="absolute left-1/2 -translate-x-1/2 bg-bg-panel border-2 border-border-main rounded-2xl p-2 flex gap-1.5 z-[200] shadow-lg"
                    >
                      {letterOptions.map((num) => (
                        <button
                          key={num ?? "any"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLetterCount(num);
                            setShowLetterMenu(false);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                            letterCount === num
                              ? "bg-accent text-white"
                              : "text-text-muted hover:bg-bg-page hover:text-text-main"
                          }`}
                        >
                          {num ? `${num} أحرف` : "أي عدد"}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Satellite 2: Tone Selector (Top Right) - Arabic with manual input option */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 54, y: -54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.05 }}
              className={`absolute left-1/2 top-1/2 pointer-events-auto transition-all ${showToneMenu ? 'z-50' : 'z-10 hover:z-50'}`}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2">
                <Tooltip content="تحديد طابع المعاني المتولده" position="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowToneMenu(!showToneMenu);
                      setShowLetterMenu(false);
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
                      tone 
                        ? "bg-accent text-white border-secondary scale-110" 
                        : "bg-bg-panel text-text-muted border-border-main hover:bg-bg-page hover:text-text-main"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </Tooltip>

                {/* Tone Options Popover - appears below the satellite icon */}
                <AnimatePresence>
                  {showToneMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 22 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className="absolute left-1/2 -translate-x-1/2 bg-bg-panel border-2 border-border-main rounded-xl p-1.5 w-48 flex flex-col gap-1 z-[200] shadow-lg text-right"
                    >
                      {/* 1. Any Tone (Default) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTone(null);
                          setShowToneMenu(false);
                        }}
                        className={`w-full px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-between gap-1 ${
                          tone === null ? "bg-accent-bg text-accent font-semibold" : "text-text-muted hover:bg-bg-page hover:text-text-main"
                        }`}
                        dir="rtl"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>✨</span>
                          <span className="font-semibold text-text-main">أي طابع / نبرة</span>
                        </div>
                      </button>

                      {/* 2. Custom Tone (User Input) - Second choice */}
                      <div 
                        className={`px-2 py-0.5 bg-bg-page border rounded-lg flex gap-1 items-center transition-all ${
                          tone && !currentTonePreset ? "border-accent bg-accent-bg text-accent" : "border-border-main/50 text-text-muted"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        dir="rtl"
                      >
                        <input
                          type="text"
                          placeholder="نبرة مخصصة..."
                          value={customToneInput}
                          onChange={(e) => setCustomToneInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              e.preventDefault();
                              if (customToneInput.trim()) {
                                setTone(customToneInput.trim());
                                setShowToneMenu(false);
                              }
                            }
                          }}
                          className="flex-1 min-w-0 bg-transparent text-[11px] py-0.5 outline-none text-text-main font-sans text-right"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (customToneInput.trim()) {
                              setTone(customToneInput.trim());
                              setShowToneMenu(false);
                            }
                          }}
                          className="shrink-0 px-1.5 py-0.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-md text-[10px] transition-colors cursor-pointer"
                        >
                          تأكيد
                        </button>
                      </div>

                      {/* Separator */}
                      <div className="border-t border-border-main/30 my-0.5" />

                      {/* 3. Tone Presets */}
                      {TONE_PRESETS.map((t) => (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTone(t.id);
                            setShowToneMenu(false);
                          }}
                          className={`w-full px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-start gap-1.5 ${
                            tone === t.id ? "bg-accent-bg text-accent font-semibold" : "text-text-muted hover:bg-bg-page hover:text-text-main"
                          }`}
                          dir="rtl"
                        >
                          <span className="text-sm">{t.emoji}</span>
                          <span className="text-text-main text-[11px]">{t.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Satellite 3: Favorite / Heart (Bottom Left) */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: -54, y: 54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto transition-all z-10 hover:z-50"
            >
              <Tooltip content="حفظ في المفضلة" position="bottom">
                <button
                  onClick={handleSelectClick}
                  className={`w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all border cursor-pointer ${
                    selected
                      ? "bg-rose-500 text-white border-rose-600 scale-110"
                      : "bg-bg-panel text-rose-500 border-border-main hover:bg-rose-50 hover:border-rose-300"
                  }`}
                >
                  <Heart className={`w-4 h-4 ${selected ? "fill-current" : ""}`} />
                </button>
              </Tooltip>
            </motion.div>
 
            {/* Satellite 4: Regenerate Children (Bottom Right) */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 54, y: 54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.12 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto transition-all z-10 hover:z-50"
            >
              <Tooltip content="إعادة توليد المعاني" position="bottom">
                <button
                  onClick={handleRegenerateClick}
                  className="w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 bg-bg-panel text-accent border border-border-main hover:bg-accent-bg hover:border-accent hover:text-accent-hover transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </motion.div>
 
            {/* Satellite 5: Word Edit (Top Center) - Uses T icon for editing the word */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 0, y: -72 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.08 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto transition-all z-20 hover:z-50"
            >
              <Tooltip content="تعديل الكلمة" position="top">
                <button
                  onClick={handleEditClick}
                  className="w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 bg-bg-panel text-accent border border-border-main hover:bg-accent-bg hover:border-accent hover:text-accent-hover transition-all cursor-pointer"
                >
                  <Type className="w-4 h-4" />
                </button>
              </Tooltip>
            </motion.div>
 
            {/* Satellite 6: Derivatives (Left Checkbox) */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: -74, y: 0 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.14 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto transition-all z-20 hover:z-50"
            >
              <Tooltip content="توليد المشتقات الصرفية" position="left">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExtractionMode(extractionMode === "derivatives" ? null : "derivatives");
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all border cursor-pointer ${
                    extractionMode === "derivatives"
                      ? "bg-rose-600 text-white border-rose-700 scale-110 shadow-md font-bold"
                      : "bg-bg-panel text-rose-500 border-rose-300 hover:bg-rose-50 hover:border-rose-400"
                  }`}
                >
                  {extractionMode === "derivatives" ? (
                    <Check className="w-4 h-4 stroke-[3px]" />
                  ) : (
                    <GitFork className="w-4 h-4" />
                  )}
                </button>
              </Tooltip>
            </motion.div>
 
            {/* Satellite 7: Plurals (Right Checkbox) */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 74, y: 0 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.16 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto transition-all z-20 hover:z-50"
            >
              <Tooltip content="توليد جموع الكلمة" position="right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExtractionMode(extractionMode === "plurals" ? null : "plurals");
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all border cursor-pointer ${
                    extractionMode === "plurals"
                      ? "bg-rose-600 text-white border-rose-700 scale-110 shadow-md font-bold"
                      : "bg-bg-panel text-rose-500 border-rose-300 hover:bg-rose-50 hover:border-rose-400"
                  }`}
                >
                  {extractionMode === "plurals" ? (
                    <Check className="w-4 h-4 stroke-[3px]" />
                  ) : (
                    <Layers className="w-4 h-4" />
                  )}
                </button>
              </Tooltip>
            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* Main Interactive Node Circle */}
      <div className="relative z-10">
        <button
          onClick={handleMainClick}
          className={`w-24 h-24 rounded-full flex flex-col items-center justify-center transition-all relative border-2 ${
            selected
              ? "bg-rose-50 border-rose-400 scale-105"
              : isRoot
              ? "bg-accent-bg border-accent font-medium text-text-main"
              : expanded
              ? "bg-bg-page/70 border-border-main text-text-muted cursor-default"
              : "bg-bg-panel border-border-main text-text-main hover:border-accent cursor-pointer"
          }`}
          style={{ minWidth: "96px", minHeight: "96px" }}
        >
          {/* Pulsing visual cues for loading */}
          {loading && (
            <div className="absolute inset-[-4px] rounded-full border-2 border-dashed border-accent animate-spin" />
          )}

          {/* Node Word Arabic text (large and bold, or editable input) */}
          {isEditingWord ? (
            <input
              type="text"
              value={editWordValue}
              onChange={(e) => setEditWordValue(e.target.value)}
              onBlur={() => {
                setIsEditingWord(false);
                if (editWordValue.trim() && editWordValue.trim() !== word) {
                  onEditWord?.(id, editWordValue.trim());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  setIsEditingWord(false);
                  if (editWordValue.trim() && editWordValue.trim() !== word) {
                    onEditWord?.(id, editWordValue.trim());
                  }
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-20 px-1 py-0.5 text-center font-sans font-bold text-sm bg-bg-page border border-border-main rounded-md outline-none focus:border-accent text-text-main z-50 relative"
              autoFocus
              dir="rtl"
            />
          ) : (
            <span 
              className={`font-sans font-bold text-base md:text-lg text-center leading-tight tracking-wide text-text-main ${
                selected ? "text-rose-950" : isRoot ? "text-accent" : ""
              }`} 
              dir="rtl"
            >
              {word}
            </span>
          )}

          {/* English pronunciation / transliteration in ALL CAPITAL LETTERS */}
          {localTransliteration && (
            <span 
              className={`font-sans font-extrabold text-[9px] md:text-[10px] text-center tracking-wider mt-1 uppercase leading-none opacity-90 ${
                selected ? "text-rose-700" : isRoot ? "text-accent-hover" : "text-text-muted"
              }`}
            >
              {localTransliteration}
            </span>
          )}

          {/* Metadata badges inside the circle if expanded/selected/root */}
          {isRoot && !localTransliteration && (
            <span className="text-[9px] font-sans font-semibold text-accent uppercase tracking-wider mt-1 opacity-80">
              البداية
            </span>
          )}

          {loading && (
            <span className="text-[8px] font-semibold text-accent mt-1 uppercase tracking-widest animate-pulse">
              جاري البحث
            </span>
          )}

          {/* Small badge showing active filters if they exist and are NOT expanded yet */}
          {!expanded && !loading && (letterCount || tone || extractionMode) && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-neutral-900 text-white text-[8px] font-sans font-bold whitespace-nowrap">
              {letterCount && <span>{letterCount}ح</span>}
              {letterCount && (tone || extractionMode) && <span className="opacity-50">|</span>}
              {tone && <span>{currentTonePreset ? "✨" : tone.length > 5 ? tone.substring(0, 4) + ".." : tone}</span>}
              {tone && extractionMode && <span className="opacity-50">|</span>}
              {extractionMode === "derivatives" && <span>مشتقات</span>}
              {extractionMode === "plurals" && <span>جموع</span>}
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
