import React, { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Calendar, Heart, ChevronDown, RefreshCw, Type, Hash, GitFork, Layers, MoreHorizontal, Repeat2, ArrowLeftRight, Tags, Music2, Link2 } from "lucide-react";
import { BrandNodeData, SuggestionMode, TONE_PRESETS, TonePreset } from "../types";
import { Tooltip } from "./Tooltip";
import { loadAIProviderSettings, toProviderRequest } from "./AISettingsModal";

export const BrandNode: React.FC<NodeProps> = ({ id, data }) => {
  const nodeData = data as unknown as BrandNodeData;
  const { word, loading, expanded, isRoot, isFavorite, onExpand, onSelect, onRegenerate, onEditWord, isCompactMoreMenu } = nodeData;

  const [isHovered, setIsHovered] = useState(false);
  const [showLetterMenu, setShowLetterMenu] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Local constraints set via satellite circles before expansion
  const [letterCount, setLetterCount] = useState<number | null>(() => nodeData.letter_count ?? null);
  const [tone, setTone] = useState<string | null>(() => {
    const pinnedActive = localStorage.getItem("pinned_brand_tone_active") === "true";
    if (pinnedActive) {
      return localStorage.getItem("pinned_brand_tone") ?? null;
    }
    return nodeData.tone ?? null;
  });
  const [isTonePinned, setIsTonePinned] = useState<boolean>(() => {
    return localStorage.getItem("pinned_brand_tone_active") === "true";
  });

  const [localTransliteration, setLocalTransliteration] = useState<string>("");
  
  // Word inline editing states
  const [isEditingWord, setIsEditingWord] = useState(() => !!nodeData.autoEdit);
  const [editWordValue, setEditWordValue] = useState(() => (nodeData.autoEdit ? "" : word));
  // While true, the node has no committed word yet and the user must type one before it can close.
  const [requireWord, setRequireWord] = useState(() => !!nodeData.autoEdit);

  // Manual custom tone state
  const [customToneInput, setCustomToneInput] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Don't clobber the field while the user is actively editing (also protects the
    // cleared auto-edit value on mount from StrictMode's double effect invocation).
    if (!isEditingWord) {
      setEditWordValue(word);
    }
  }, [word]);

  useEffect(() => {
    if (isEditingWord) {
      // Defer past React Flow's own mount/fitView focus handling so the caret lands in the
      // input and not on the node wrapper. A short timeout wins the focus race more reliably
      // than a single rAF on first start.
      const t = setTimeout(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [isEditingWord]);

  // If this node's auto-edit flag clears (e.g. a saved tree is restored onto the persisted
  // root instance), leave the pending edit state and accept the incoming word.
  useEffect(() => {
    if (!nodeData.autoEdit) {
      setIsEditingWord(false);
      setRequireWord(false);
      setEditWordValue(word);
    }
  }, [nodeData.autoEdit]);

  // Reactive synchronization for pinned tone across all active nodes in the tree
  useEffect(() => {
    const handlePinnedChange = () => {
      const pinnedActive = localStorage.getItem("pinned_brand_tone_active") === "true";
      if (pinnedActive) {
        const pinnedTone = localStorage.getItem("pinned_brand_tone");
        setTone(pinnedTone);
        setIsTonePinned(true);
        if (pinnedTone) {
          const isPreset = TONE_PRESETS.some(t => t.id === pinnedTone);
          if (!isPreset) {
            setCustomToneInput(pinnedTone);
          }
        }
      } else {
        setIsTonePinned(false);
      }
    };

    window.addEventListener("brand_tone_pinned_changed", handlePinnedChange);
    return () => {
      window.removeEventListener("brand_tone_pinned_changed", handlePinnedChange);
    };
  }, []);

  // Set custom tone input field if pinned custom tone exists on mount
  useEffect(() => {
    const pinnedActive = localStorage.getItem("pinned_brand_tone_active") === "true";
    if (pinnedActive) {
      const pinnedTone = localStorage.getItem("pinned_brand_tone") ?? "";
      if (pinnedTone) {
        const isPreset = TONE_PRESETS.some(t => t.id === pinnedTone);
        if (!isPreset) {
          setCustomToneInput(pinnedTone);
        }
      }
    }
  }, []);

  const handleSetTone = (newTone: string | null) => {
    setTone(newTone);
    if (isTonePinned) {
      if (newTone !== null) {
        localStorage.setItem("pinned_brand_tone_active", "true");
        localStorage.setItem("pinned_brand_tone", newTone);
      } else {
        localStorage.setItem("pinned_brand_tone_active", "true");
        localStorage.setItem("pinned_brand_tone", "");
      }
      window.dispatchEvent(new Event("brand_tone_pinned_changed"));
    }
  };

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
          body: JSON.stringify({ word, provider: toProviderRequest(loadAIProviderSettings()) }),
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
        setShowMoreMenu(false);
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
    onExpand(id, { letter_count: letterCount, tone, mode: null });
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(word, id);
  };

  const handleRegenerateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRegenerate) {
      onRegenerate(id, { letter_count: letterCount, tone, mode: null });
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingWord(!isEditingWord);
    setIsHovered(false);
  };

  // Attempt to save the edited word. When empty or invalid, stay in edit mode and
  // re-focus so the user is forced to provide a valid word before the node closes.
  const commitEditWord = () => {
    const trimmed = editWordValue.trim();
    if (!trimmed) {
      editInputRef.current?.focus();
      return;
    }
    if (trimmed !== word) {
      const success = onEditWord?.(id, trimmed);
      if (success === false) {
        editInputRef.current?.focus();
        return;
      }
    }
    setRequireWord(false);
    setIsEditingWord(false);
  };

  const cancelEditWord = () => {
    // A word is mandatory while pending — block cancel until one is entered.
    if (requireWord) {
      editInputRef.current?.focus();
      return;
    }
    setEditWordValue(word);
    setIsEditingWord(false);
  };

  const letterOptions = [null, 3, 4, 5, 6];

  const moreMenuOptions: { mode?: SuggestionMode; label: string; icon: React.ElementType }[] = [
    { mode: "synonyms", label: "مرادفات", icon: Repeat2 },
    { mode: "antonyms", label: "أضداد", icon: ArrowLeftRight },
    { mode: "nisba", label: "اسم النسب", icon: Tags },
    { mode: "rhymes", label: "قوافي", icon: Music2 },
    { mode: "compounds", label: "أسماء مركبة", icon: Link2 },
  ];
  const regenerateOption = { mode: undefined as SuggestionMode | undefined, label: "إعادة توليد", icon: RefreshCw };

  const handleMoreOptionClick = (e: React.MouseEvent, mode?: SuggestionMode) => {
    e.stopPropagation();
    if (onRegenerate) {
      onRegenerate(id, { letter_count: letterCount, tone, mode: mode ?? null });
    }
    setShowMoreMenu(false);
  };

  // Derivatives/plurals satellites generate immediately on click rather than acting as a
  // sticky toggle: expand if the node has no children yet, otherwise regenerate them.
  const handleQuickGenerate = (e: React.MouseEvent, mode: SuggestionMode) => {
    e.stopPropagation();
    if (loading) return;
    const constraints = { letter_count: letterCount, tone, mode };
    if (expanded) {
      onRegenerate?.(id, constraints);
    } else {
      onExpand(id, constraints);
    }
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative p-4 select-none",
        (isHovered || showLetterMenu || showToneMenu || showMoreMenu) && [
          "before:content-[''] before:absolute before:inset-[-48px] before:rounded-full before:pointer-events-auto",
          "z-50"
        ]
      )}
      onMouseEnter={() => {
        if (!isEditingWord) setIsHovered(true);
      }}
      onMouseLeave={() => {
        // Only hide if menus aren't actively open
        if (!showLetterMenu && !showToneMenu && !showMoreMenu) {
          setIsHovered(false);
        }
      }}
    >
      {/* Target handle for incoming parent lines (centered behind the node) */}
      <Handle
        type="target"
        position={Position.Top}
        className={clsx("w-1 h-1 pointer-events-none", "opacity-0")}
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      {/* Source handle for outgoing children lines (centered behind the node) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={clsx("w-1 h-1 pointer-events-none", "opacity-0")}
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      {/* Satellites Orbit Group */}
      <AnimatePresence>
        {(isHovered || showLetterMenu || showToneMenu || showMoreMenu) && !isEditingWord && (
          <div className={clsx("absolute inset-0 z-[100] pointer-events-none")}>
            
            {/* Satellite 1: Letter Count (Top Left) - Uses Hash icon for number count */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: -54, y: -54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={clsx(
                "absolute left-1/2 top-1/2 pointer-events-auto",
                showLetterMenu ? "z-50" : "z-10 hover:z-50"
              )}
              style={{ originX: 0, originY: 0 }}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="تحديد عدد الحروف" position="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLetterMenu(!showLetterMenu);
                      setShowToneMenu(false);
                    }}
                    className={clsx(
                      "flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "border rounded-full transition-all",
                      letterCount
                        ? "bg-accent text-white border-secondary scale-110"
                        : "bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main border-border-main"
                    )}
                  >
                    <Hash className={clsx("w-4 h-4")} />
                  </button>
                </Tooltip>

                {/* Letter Options Popover - appears below the satellite icon */}
                <AnimatePresence>
                  {showLetterMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 22 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className={clsx(
                        "absolute left-1/2 z-[200] flex gap-1.5 p-2 -translate-x-1/2",
                        "bg-bg-panel",
                        "border-2 border-border-main rounded-2xl",
                        "shadow-lg"
                      )}
                    >
                      {letterOptions.map((num) => (
                        <button
                          key={num ?? "any"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLetterCount(num);
                            setShowLetterMenu(false);
                          }}
                          className={clsx(
                            "px-3 py-1.5 cursor-pointer whitespace-nowrap",
                            "font-medium text-xs",
                            "rounded-xl transition-colors",
                            letterCount === num
                              ? "bg-accent text-white"
                              : "hover:bg-bg-page text-text-muted hover:text-text-main"
                          )}
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
              className={clsx(
                "absolute left-1/2 top-1/2 pointer-events-auto",
                showToneMenu ? "z-50" : "z-10 hover:z-50"
              )}
              style={{ originX: 0, originY: 0 }}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="تحديد طابع المعاني المتولده" position="top">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowToneMenu(!showToneMenu);
                      setShowLetterMenu(false);
                    }}
                    className={clsx(
                      "relative flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "border rounded-full transition-all",
                      tone
                        ? "bg-accent text-white border-secondary scale-110"
                        : "bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main border-border-main"
                    )}
                  >
                    <Sparkles className={clsx("w-4 h-4")} />
                    {isTonePinned && (
                      <span
                        className={clsx(
                          "absolute -top-1 -right-1 flex items-center justify-center",
                          "w-3.5 h-3.5",
                          "bg-amber-500 text-[8px]",
                          "border border-white rounded-full",
                          "shadow-sm"
                        )}
                      >
                        📌
                      </span>
                    )}
                  </button>
                </Tooltip>

                {/* Tone Options Popover - appears below the satellite icon */}
                <AnimatePresence>
                  {showToneMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 22 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className={clsx(
                        "absolute left-1/2 z-[200] flex flex-col gap-1 p-1.5 text-right -translate-x-1/2",
                        "w-48",
                        "bg-bg-panel",
                        "border-2 border-border-main rounded-xl",
                        "shadow-lg"
                      )}
                    >
                      {/* Pinned/Lock Toggle Switch / Header */}
                      <div
                        className={clsx(
                          "flex items-center justify-between gap-1 mb-1 px-1 pb-1.5",
                          "text-[11px]",
                          "border-b border-border-main/40"
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newPinState = !isTonePinned;
                            setIsTonePinned(newPinState);
                            if (newPinState) {
                              localStorage.setItem("pinned_brand_tone_active", "true");
                              localStorage.setItem("pinned_brand_tone", tone ?? "");
                            } else {
                              localStorage.removeItem("pinned_brand_tone_active");
                              localStorage.removeItem("pinned_brand_tone");
                            }
                            window.dispatchEvent(new Event("brand_tone_pinned_changed"));
                          }}
                          className={clsx(
                            "px-1.5 py-0.5 cursor-pointer",
                            "font-semibold text-[10px]",
                            "rounded-md transition-all",
                            isTonePinned
                              ? "bg-amber-100 text-amber-700 border border-amber-300"
                              : "bg-bg-page text-text-muted hover:text-text-main border border-border-main/60"
                          )}
                        >
                          {isTonePinned ? "مفعّل 📌" : "تفعيل"}
                        </button>
                        <span className={clsx("text-text-muted font-bold")}>تثبيت الطابع (قفل 🔒)</span>
                      </div>

                      {/* 1. Any Tone (Default) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetTone(null);
                          setShowToneMenu(false);
                        }}
                        className={clsx(
                          "flex items-center justify-between gap-1 px-2 py-1 cursor-pointer",
                          "w-full",
                          "text-[11px] font-medium",
                          "rounded-lg transition-colors",
                          tone === null
                            ? "bg-accent-bg text-accent font-semibold"
                            : "hover:bg-bg-page text-text-muted hover:text-text-main"
                        )}
                        dir="rtl"
                      >
                        <div className={clsx("flex items-center gap-1.5")}>
                          <span>✨</span>
                          <span className={clsx("text-text-main font-semibold")}>أي طابع / نبرة</span>
                        </div>
                      </button>

                      {/* 2. Custom Tone (User Input) - Second choice */}
                      <div 
                        className={clsx(
                          "flex items-center gap-1 px-2 py-0.5",
                          "rounded-lg border transition-all",
                          tone && !currentTonePreset
                            ? "bg-accent-bg text-accent border-accent"
                            : "bg-bg-page text-text-muted border-border-main/50"
                        )}
                        onClick={(e) => e.stopPropagation()}
                        dir="rtl"
                      >
                        <input
                          type="text"
                          placeholder="طابع مخصص"
                          value={customToneInput}
                          onChange={(e) => setCustomToneInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              e.preventDefault();
                              if (customToneInput.trim()) {
                                handleSetTone(customToneInput.trim());
                                setShowToneMenu(false);
                              }
                            }
                          }}
                          className={clsx(
                            "flex-1 min-w-0 py-0.5 text-right outline-none",
                            "bg-transparent text-text-main font-sans text-[11px]"
                          )}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (customToneInput.trim()) {
                              handleSetTone(customToneInput.trim());
                              setShowToneMenu(false);
                            }
                          }}
                          className={clsx(
                            "shrink-0 px-1.5 py-0.5 cursor-pointer",
                            "bg-accent hover:bg-accent-hover text-white font-bold text-[10px]",
                            "rounded-md transition-colors"
                          )}
                        >
                          تأكيد
                        </button>
                      </div>

                      {/* Separator */}
                      <div className={clsx("my-0.5 border-t border-border-main/30")} />

                      {/* 3. Tone Presets */}
                      {TONE_PRESETS.map((t) => (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetTone(t.id);
                            setShowToneMenu(false);
                          }}
                          className={clsx(
                            "flex items-center justify-start gap-1.5 px-2 py-1 cursor-pointer",
                            "w-full",
                            "text-[11px] font-medium",
                            "rounded-lg transition-colors",
                            tone === t.id
                              ? "bg-accent-bg text-accent font-semibold"
                              : "hover:bg-bg-page text-text-muted hover:text-text-main"
                          )}
                          dir="rtl"
                        >
                          <span className="text-sm">{t.emoji}</span>
                          <span className={clsx("text-text-main text-[11px]")}>{t.label}</span>
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
              className={clsx("absolute left-1/2 top-1/2 z-10 hover:z-50 pointer-events-auto")}
              style={{ originX: 0, originY: 0 }}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="حفظ في المفضلة" position="bottom">
                  <button
                    onClick={handleSelectClick}
                    className={clsx(
                      "flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "border rounded-full transition-all",
                      isFavorite
                        ? "bg-accent text-white border-accent-hover scale-110"
                        : "bg-bg-panel text-accent hover:bg-accent-bg border-border-main hover:border-accent"
                    )}
                  >
                    <Heart
                      className={clsx(
                        "w-4 h-4",
                        isFavorite && "fill-current"
                      )}
                    />
                  </button>
                </Tooltip>
              </div>
            </motion.div>
 
            {/* Satellite 4: More Options (Bottom Right) - hover reveals regenerate + extra extraction modes */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 54, y: 54 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.12 }}
              className={clsx(
                "absolute left-1/2 top-1/2 pointer-events-auto",
                showMoreMenu ? "z-50" : "z-10 hover:z-50"
              )}
              style={{ originX: 0, originY: 0 }}
              onMouseEnter={() => setShowMoreMenu(true)}
              onMouseLeave={() => setShowMoreMenu(false)}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="المزيد من خيارات التوليد" position="bottom">
                  <button
                    onClick={handleRegenerateClick}
                    className={clsx(
                      "flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "bg-bg-panel text-accent hover:bg-accent-bg hover:text-accent-hover",
                      "border border-border-main hover:border-accent rounded-full",
                      "transition-all"
                    )}
                  >
                    <MoreHorizontal className={clsx("w-4 h-4")} />
                  </button>
                </Tooltip>

                {/* More Options Popover - appears below the satellite icon on hover */}
                <AnimatePresence>
                  {showMoreMenu && (
                    isCompactMoreMenu ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 22 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        className={clsx(
                          "absolute left-1/2 z-[200] flex flex-wrap items-center justify-center gap-1 p-1.5 -translate-x-1/2",
                          "w-32",
                          "bg-bg-panel",
                          "border-2 border-border-main rounded-xl",
                          "shadow-lg"
                        )}
                      >
                        {[regenerateOption, ...moreMenuOptions].map(({ mode, label, icon: Icon }) => (
                          <Tooltip key={mode ?? "regenerate"} content={label} position="bottom">
                            <button
                              onClick={(e: React.MouseEvent) => handleMoreOptionClick(e, mode)}
                              className={clsx(
                                "flex items-center justify-center cursor-pointer",
                                "w-7 h-7",
                                "rounded-lg transition-colors",
                                "hover:bg-bg-page text-text-muted hover:text-text-main"
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 22 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        className={clsx(
                          "absolute left-1/2 z-[200] flex flex-col gap-1 p-1.5 text-right -translate-x-1/2",
                          "w-40",
                          "bg-bg-panel",
                          "border-2 border-border-main rounded-xl",
                          "shadow-lg"
                        )}
                      >
                        <button
                          onClick={(e: React.MouseEvent) => handleMoreOptionClick(e)}
                          className={clsx(
                            "flex items-center justify-start gap-1.5 px-2 py-1 cursor-pointer",
                            "w-full",
                            "text-[11px] font-medium",
                            "rounded-lg transition-colors",
                            "hover:bg-bg-page text-text-muted hover:text-text-main"
                          )}
                          dir="rtl"
                        >
                          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                          <span>إعادة توليد</span>
                        </button>

                        <div className={clsx("my-0.5 border-t border-border-main/30")} />

                        {moreMenuOptions.map(({ mode, label, icon: Icon }) => (
                          <button
                            key={mode}
                            onClick={(e: React.MouseEvent) => handleMoreOptionClick(e, mode)}
                            className={clsx(
                              "flex items-center justify-start gap-1.5 px-2 py-1 cursor-pointer",
                              "w-full",
                              "text-[11px] font-medium",
                              "rounded-lg transition-colors",
                              "hover:bg-bg-page text-text-muted hover:text-text-main"
                            )}
                            dir="rtl"
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Satellite 5: Word Edit (Top Center) - Uses T icon for editing the word */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 0, y: -72 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.08 }}
              className={clsx("absolute left-1/2 top-1/2 z-20 hover:z-50 pointer-events-auto")}
              style={{ originX: 0, originY: 0 }}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="تعديل الكلمة" position="top">
                  <button
                    onClick={handleEditClick}
                    className={clsx(
                      "flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "bg-bg-panel text-accent hover:bg-accent-bg hover:text-accent-hover",
                      "border border-border-main hover:border-accent rounded-full",
                      "transition-all"
                    )}
                  >
                    <Type className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            </motion.div>
 
            {/* Satellite 6: Derivatives (Left) - generates immediately on click */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: -74, y: 0 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.14 }}
              className={clsx("absolute left-1/2 top-1/2 z-20 hover:z-50 pointer-events-auto")}
              style={{ originX: 0, originY: 0 }}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="توليد المشتقات الصرفية" position="left">
                  <button
                    onClick={(e) => handleQuickGenerate(e, "derivatives")}
                    className={clsx(
                      "flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "bg-bg-panel text-accent hover:bg-accent-bg hover:text-accent-hover",
                      "border border-border-main hover:border-accent rounded-full",
                      "transition-all"
                    )}
                  >
                    <GitFork className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            </motion.div>

            {/* Satellite 7: Plurals (Right) - generates immediately on click */}
            <motion.div
              initial={{ scale: 0, x: 0, y: 0 }}
              animate={{ scale: 1, x: 74, y: 0 }}
              exit={{ scale: 0, x: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.16 }}
              className={clsx("absolute left-1/2 top-1/2 z-20 hover:z-50 pointer-events-auto")}
              style={{ originX: 0, originY: 0 }}
            >
              <div className={clsx("relative -translate-x-1/2 -translate-y-1/2")}>
                <Tooltip content="توليد جموع الكلمة" position="right">
                  <button
                    onClick={(e) => handleQuickGenerate(e, "plurals")}
                    className={clsx(
                      "flex items-center justify-center cursor-pointer",
                      "w-8 h-8",
                      "bg-bg-panel text-accent hover:bg-accent-bg hover:text-accent-hover",
                      "border border-border-main hover:border-accent rounded-full",
                      "transition-all"
                    )}
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* Main Interactive Node Circle */}
      <div className={clsx("relative z-10")}>
        <button
          onClick={handleMainClick}
          className={clsx(
            "relative flex flex-col items-center justify-center",
            "w-24 h-24",
            "border-2 rounded-full transition-all",
            expanded || loading || isEditingWord ? "cursor-default" : "cursor-pointer hover:border-accent",
            isFavorite
              ? "bg-accent text-white scale-105 border-accent-hover shadow-md"
              : isRoot
              ? "bg-accent-bg text-text-main font-medium border-accent"
              : "bg-bg-panel text-text-main border-border-main"
          )}
          style={{ minWidth: "96px", minHeight: "96px" }}
        >
          {/* Pulsing visual cues for loading */}
          {loading && (
            <svg 
              className={clsx(
                "absolute -inset-2 pointer-events-none",
                "w-[calc(100%+16px)] h-[calc(100%+16px)]",
                "text-accent",
                "animate-spin [animation-duration:3s]"
              )}
              viewBox="0 0 112 112"
            >
              <circle
                cx="56"
                cy="56"
                r="53"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="6 8"
              />
            </svg>
          )}

          {/* Node Word Arabic text (large and bold, or editable input) */}
          {isEditingWord ? (
            <input
              ref={editInputRef}
              type="text"
              placeholder="اكتب كلمة..."
              value={editWordValue}
              onChange={(e) => setEditWordValue(e.target.value)}
              onBlur={commitEditWord}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  commitEditWord();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  cancelEditWord();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                "relative z-50 px-1 py-0.5 text-center outline-none",
                "w-20",
                "bg-bg-page text-text-main font-sans font-bold text-sm placeholder:text-gray-300 placeholder:text-xs",
                "border border-border-main focus:border-accent rounded-md"
              )}
              dir="rtl"
            />
          ) : (
            <span 
              className={clsx(
                "text-center leading-tight tracking-wide font-sans font-bold text-base",
                isFavorite ? "text-white" : isRoot ? "text-accent" : "text-text-main",
                "md:text-lg"
              )}
              dir="rtl"
            >
              {word}
            </span>
          )}

          {/* While editing, prompt the user; otherwise show the transliteration */}
          {isEditingWord ? (
            <span
              className={clsx(
                "mt-1 text-center leading-none tracking-wider uppercase opacity-90",
                "text-accent font-sans font-extrabold text-[9px]",
                "md:text-[10px]"
              )}
            >
              ADD A WORD
            </span>
          ) : (
            <>
              {/* English pronunciation / transliteration in ALL CAPITAL LETTERS */}
              {localTransliteration && (
                <span
                  className={clsx(
                    "mt-1 text-center leading-none tracking-wider uppercase opacity-90",
                    "font-sans font-extrabold text-[9px]",
                    isFavorite ? "text-white/80" : isRoot ? "text-accent-hover" : "text-text-muted",
                    "md:text-[10px]"
                  )}
                >
                  {localTransliteration}
                </span>
              )}

              {/* Metadata badges inside the circle if expanded/selected/root */}
              {isRoot && !localTransliteration && (
                <span
                  className={clsx(
                    "mt-1 uppercase tracking-wider opacity-80",
                    "text-accent font-sans font-semibold text-[9px]"
                  )}
                >
                  البداية
                </span>
              )}
            </>
          )}

          {loading && (
            <span
              className={clsx(
                "mt-1 uppercase tracking-widest animate-pulse",
                "text-accent font-semibold text-[8px]"
              )}
            >
              جاري البحث
            </span>
          )}

          {/* Small badge showing active filters if they exist and are NOT expanded yet */}
          {!expanded && !loading && (letterCount || tone) && (
            <div
              className={clsx(
                "absolute -bottom-1 left-1/2 flex items-center gap-0.5 px-1.5 py-0.5 whitespace-nowrap -translate-x-1/2",
                "bg-neutral-900 text-white font-sans font-bold text-[8px]",
                "rounded-full"
              )}
            >
              {letterCount && <span>{letterCount}ح</span>}
              {letterCount && tone && <span className={clsx("opacity-50")}>|</span>}
              {tone && <span>{currentTonePreset ? "✨" : tone.length > 5 ? tone.substring(0, 4) + ".." : tone}</span>}
            </div>
          )}
        </button>
      </div>
    </div>
  );
};
