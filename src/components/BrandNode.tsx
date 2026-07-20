import React, { useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Calendar, Heart, ChevronDown, RefreshCw, Type, Hash } from "lucide-react";
import { BrandNodeData, TONE_PRESETS, TonePreset } from "../types";

export const BrandNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as BrandNodeData;
  const { word, loading, expanded, isRoot, selected, onExpand, onSelect, onRegenerate, onEditWord } = nodeData;

  const [isHovered, setIsHovered] = useState(false);
  const [showLetterMenu, setShowLetterMenu] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);

  // Local constraints set via satellite circles before expansion
  const [letterCount, setLetterCount] = useState<number | null>(null);
  const [tone, setTone] = useState<string | null>(null);

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
    onExpand(id, { letter_count: letterCount, tone });
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(word, id);
  };

  const handleRegenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerate) {
      onRegenerate(id, { letter_count: letterCount, tone });
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
              className={`absolute left-1/2 top-1/2 pointer-events-auto ${showLetterMenu ? 'z-50' : 'z-10'}`}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLetterMenu(!showLetterMenu);
                    setShowToneMenu(false);
                  }}
                  title="تصفية حسب عدد الحروف (Filter by length)"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
                    letterCount 
                      ? "bg-amber-500 text-white border-amber-600 scale-110" 
                      : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  <Hash className="w-4 h-4" />
                </button>

                {/* Letter Options Popover - appears below the satellite icon */}
                <AnimatePresence>
                  {showLetterMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 22 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className="absolute left-1/2 -translate-x-1/2 bg-white border-2 border-neutral-300 rounded-2xl p-2 flex gap-1.5 z-[200] shadow-lg"
                    >
                      {letterOptions.map((num) => (
                        <button
                          key={num ?? "any"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLetterCount(num);
                            setShowLetterMenu(false);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                            letterCount === num
                              ? "bg-amber-500 text-white"
                              : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
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
              className={`absolute left-1/2 top-1/2 pointer-events-auto ${showToneMenu ? 'z-50' : 'z-10'}`}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowToneMenu(!showToneMenu);
                    setShowLetterMenu(false);
                  }}
                  title="تصفية حسب النبرة (Filter by tone)"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
                    tone 
                      ? "bg-indigo-600 text-white border-indigo-700 scale-110" 
                      : "bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                {/* Tone Options Popover - appears below the satellite icon */}
                <AnimatePresence>
                  {showToneMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 22 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className="absolute left-1/2 -translate-x-1/2 bg-white border-2 border-neutral-300 rounded-2xl p-2 w-60 flex flex-col gap-1 z-[200] shadow-lg text-right"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTone(null);
                          setShowToneMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                          tone === null ? "bg-indigo-50 text-indigo-600" : "text-neutral-600 hover:bg-neutral-50"
                        }`}
                        dir="rtl"
                      >
                        <div className="flex items-center gap-2">
                          <span>✨</span>
                          <span className="font-semibold text-neutral-800">أي طابع / نبرة</span>
                        </div>
                        <span className="text-[10px] text-neutral-400">بدون تصفية</span>
                      </button>

                      {TONE_PRESETS.map((t) => (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTone(t.id);
                            setShowToneMenu(false);
                          }}
                          className={`w-full px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors flex flex-col items-end gap-0.5 ${
                            tone === t.id ? "bg-indigo-50 text-indigo-600" : "text-neutral-600 hover:bg-neutral-50"
                          }`}
                          dir="rtl"
                        >
                          <div className="flex items-center gap-1.5 w-full justify-start text-right">
                            <span className="text-sm">{t.emoji}</span>
                            <span className="font-semibold text-neutral-800">{t.label}</span>
                          </div>
                          <p className="text-[10px] text-neutral-400 font-normal leading-tight text-right w-full pr-5">{t.description}</p>
                        </button>
                      ))}

                      {/* Display Custom Tone if selected and not a preset */}
                      {tone && !currentTonePreset && (
                        <div className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-between" dir="rtl">
                          <span className="truncate">نبرة حالية: {tone}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTone(null);
                            }}
                            className="text-indigo-400 hover:text-indigo-600 font-bold px-1"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      {/* Manual Tone Input Section */}
                      <div className="border-t border-neutral-100 my-1 pt-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] font-bold text-neutral-400 block mb-1 text-right px-2.5">نبرة مخصصة (كتابة يدوية):</span>
                        <div className="flex gap-1 px-1 w-full items-center justify-between">
                          <input
                            type="text"
                            placeholder="مثلاً: حماسي، غامض..."
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
                            className="flex-1 min-w-0 px-2 py-1 bg-neutral-50 border border-neutral-300 rounded-lg text-xs outline-none focus:border-indigo-500 font-sans text-right"
                            dir="rtl"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (customToneInput.trim()) {
                                setTone(customToneInput.trim());
                                setShowToneMenu(false);
                              }
                            }}
                            className="shrink-0 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            تأكيد
                          </button>
                        </div>
                      </div>
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
              className="absolute left-1/2 top-1/2 pointer-events-auto z-10"
            >
              <button
                onClick={handleSelectClick}
                title="حفظ في المفضلة (Save to favorites)"
                className={`w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all border cursor-pointer ${
                  selected
                    ? "bg-rose-500 text-white border-rose-600 scale-110"
                    : "bg-white text-rose-500 border-neutral-300 hover:bg-rose-50 hover:border-rose-400"
                }`}
              >
                <Heart className={`w-4 h-4 ${selected ? "fill-current" : ""}`} />
              </button>
            </motion.div>

            {/* Satellite 4: Regenerate Children (Bottom Right) */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 54, y: 54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.12 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto z-10"
            >
              <button
                onClick={handleRegenerateClick}
                title="إعادة توليد الفروع (Regenerate children)"
                className="w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 bg-white text-indigo-600 border border-neutral-300 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </motion.div>

            {/* Satellite 5: Word Edit (Top Center) - Uses T icon for editing the word */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 0, y: -72 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.08 }}
              className="absolute left-1/2 top-1/2 pointer-events-auto z-20"
            >
              <button
                onClick={handleEditClick}
                title="تعديل الكلمة (Edit word)"
                className="w-8 h-8 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 bg-white text-amber-600 border border-neutral-300 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 transition-all cursor-pointer"
              >
                <Type className="w-4 h-4" />
              </button>
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
              ? "bg-indigo-50 border-indigo-500 font-medium"
              : expanded
              ? "bg-neutral-50 border-neutral-300 text-neutral-500 cursor-default"
              : "bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400 cursor-pointer"
          }`}
          style={{ minWidth: "96px", minHeight: "96px" }}
        >
          {/* Pulsing visual cues for loading */}
          {loading && (
            <div className="absolute inset-[-4px] rounded-full border-2 border-dashed border-indigo-500 animate-spin" />
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
              className="w-20 px-1 py-0.5 text-center font-sans font-bold text-sm bg-neutral-100 border border-neutral-400 rounded-md outline-none focus:border-indigo-500 text-neutral-900 z-50 relative"
              autoFocus
              dir="rtl"
            />
          ) : (
            <span 
              className={`font-sans font-bold text-base md:text-lg text-center leading-tight tracking-wide text-neutral-900 ${
                selected ? "text-rose-950" : isRoot ? "text-indigo-950" : ""
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
                selected ? "text-rose-700" : isRoot ? "text-indigo-700" : "text-neutral-500"
              }`}
            >
              {localTransliteration}
            </span>
          )}

          {/* Metadata badges inside the circle if expanded/selected/root */}
          {isRoot && !localTransliteration && (
            <span className="text-[9px] font-sans font-semibold text-indigo-500 uppercase tracking-wider mt-1 opacity-80">
              البداية
            </span>
          )}

          {loading && (
            <span className="text-[8px] font-semibold text-indigo-500 mt-1 uppercase tracking-widest animate-pulse">
              جاري البحث
            </span>
          )}

          {/* Small badge showing active filters if they exist and are NOT expanded yet */}
          {!expanded && !loading && (letterCount || tone) && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-neutral-900 text-white text-[8px] font-sans font-bold">
              {letterCount && <span>{letterCount}ح</span>}
              {letterCount && tone && <span className="opacity-50">|</span>}
              {tone && <span>{currentTonePreset ? "✨" : tone.length > 5 ? tone.substring(0, 4) + ".." : tone}</span>}
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
