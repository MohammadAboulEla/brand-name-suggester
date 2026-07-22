import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BrandNode } from "./BrandNode";
import { BrandNodeData } from "../types";
import { Sparkles, HelpCircle, RotateCcw, Trash2, Download, Upload, History, Eraser, Network, Shrink } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { motion, AnimatePresence } from "motion/react";
import { loadAIProviderSettings, toProviderRequest } from "./AISettingsModal";

const nodeTypes = {
  brandNode: BrandNode,
};

const MOCK_TEST_WORDS = [
  { word: "تجربة", transliteration: "TAJRIBA" },
  { word: "اختبار", transliteration: "IKHTIBAR" },
  { word: "وهمي", transliteration: "WAHMY" },
  { word: "نموذج", transliteration: "NAMUDHAJ" },
  { word: "علامة", transliteration: "ALAMAH" },
  { word: "فكرة", transliteration: "FIKRAH" },
  { word: "مشروع", transliteration: "MASHROU" },
  { word: "تطبيق", transliteration: "TATBEEQ" },
  { word: "براند", transliteration: "BRAND" },
  { word: "مسار", transliteration: "MASAR" },
  { word: "إبداع", transliteration: "IBDA" },
  { word: "أفق", transliteration: "OFUQ" },
  { word: "ريادة", transliteration: "RIYADAH" },
  { word: "وميض", transliteration: "WAMEEDH" },
  { word: "أثير", transliteration: "ATHEER" },
  { word: "جوهر", transliteration: "JAWHAR" },
  { word: "ألفا", transliteration: "ALFA" },
  { word: "بيتا", transliteration: "BETA" }
];

// Radial spacing distance for new children branches
const BRANCH_DISTANCE = 250;

// localStorage key used to auto-persist the last session so work survives a refresh/close.
const LAST_TREE_STORAGE_KEY = "brand_tree_last_session";

// Helper to resolve overlapping nodes iteratively
function resolveOverlaps(
  x: number,
  y: number,
  existing: { x: number; y: number }[],
  minDistance = 160
): { x: number; y: number } {
  let posX = x;
  let posY = y;
  let attempts = 0;
  let foundOverlap = true;

  while (foundOverlap && attempts < 50) {
    foundOverlap = false;
    for (const node of existing) {
      const dx = posX - node.x;
      const dy = posY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        foundOverlap = true;
        if (distance === 0) {
          posX += Math.random() * 40 - 20;
          posY += minDistance;
        } else {
          const force = (minDistance - distance) / distance;
          posX += dx * force;
          posY += dy * force;
        }
      }
    }
    attempts++;
  }
  return { x: posX, y: posY };
}

const getDescendants = (nodeId: string, currentNodes: Node[]): string[] => {
  const descendants: string[] = [];
  const queue = [nodeId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = currentNodes.filter((n) => n.data.parentId === currentId);
    for (const child of children) {
      if (!descendants.includes(child.id)) {
        descendants.push(child.id);
        queue.push(child.id);
      }
    }
  }
  return descendants;
};

// Packed layout: lay each subtree out inside its own bounding box, wrapping siblings
// into a near-square block (row-packing) instead of a single wide row, so the overall
// width/height stay small. Same-depth nodes are NOT forced onto the same line.
type PackedBox = { pos: Map<string, { x: number; y: number }>; w: number; h: number };

function packSubtree(
  nodeId: string,
  childrenMap: Map<string, string[]>,
  nodeSize: number,
  gap: number
): PackedBox {
  const kids = childrenMap.get(nodeId) ?? [];
  if (kids.length === 0) {
    return { pos: new Map([[nodeId, { x: 0, y: 0 }]]), w: nodeSize, h: nodeSize };
  }

  const boxes = kids.map((k) => packSubtree(k, childrenMap, nodeSize, gap));

  // Aim for a roughly square children block: wrap once a row exceeds this target width.
  const totalArea = boxes.reduce((s, b) => s + (b.w + gap) * (b.h + gap), 0);
  const targetW = Math.max(Math.max(...boxes.map((b) => b.w)), Math.sqrt(totalArea) * 1.3);

  const placed: { box: PackedBox; ox: number; oy: number }[] = [];
  let x = 0, y = 0, rowH = 0, maxRowW = 0;
  for (const b of boxes) {
    if (x > 0 && x + b.w > targetW) {
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    placed.push({ box: b, ox: x, oy: y });
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
    maxRowW = Math.max(maxRowW, x - gap);
  }

  const blockW = maxRowW;
  const blockH = y + rowH;
  const totalW = Math.max(nodeSize, blockW);
  const childrenYOffset = nodeSize + gap;

  const pos = new Map<string, { x: number; y: number }>();
  pos.set(nodeId, { x: (totalW - nodeSize) / 2, y: 0 }); // parent centered over its block
  const blockXOffset = (totalW - blockW) / 2;
  for (const { box, ox, oy } of placed) {
    for (const [id, p] of box.pos) {
      pos.set(id, { x: blockXOffset + ox + p.x, y: childrenYOffset + oy + p.y });
    }
  }

  return { pos, w: totalW, h: childrenYOffset + blockH };
}

interface ExplorationTreeProps {
  rootWord: string;
  onSelectWord: (word: string) => void;
  selectedWord: string | null;
  favorites: string[];
  onLoadProject?: (rootWord: string, favorites: string[], selectedWord: string | null) => void;
  edgeType?: string;
  isEdgeDashed?: boolean;
  isFakeMode?: boolean;
  autoEditRoot?: boolean;
}

export const ExplorationTree: React.FC<ExplorationTreeProps> = ({
  rootWord,
  onSelectWord,
  selectedWord,
  favorites,
  onLoadProject,
  edgeType = "default",
  isEdgeDashed = true,
  isFakeMode = false,
  autoEditRoot = false,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const regenerateRef = useRef<any>(null);
  const handleExpandRef = useRef<any>(null);
  const selectRef = useRef<any>(null);
  const isFakeModeRef = useRef(isFakeMode);

  // Keep isFakeModeRef up to date
  useEffect(() => {
    isFakeModeRef.current = isFakeMode;
  }, [isFakeMode]);

  // Delete Node States
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const hoveredNodeRef = useRef<Node | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [ignoreConfirm, setIgnoreConfirm] = useState(() => {
    return sessionStorage.getItem("ignore_delete_confirm") === "true";
  });

  // Keep hoveredNodeRef up to date for keydown event handler
  useEffect(() => {
    hoveredNodeRef.current = hoveredNode;
  }, [hoveredNode]);

  // Handle node deletion
  const handleDeleteNode = useCallback((nodeId: string) => {
    const nodeToDeleteObj = nodes.find(n => n.id === nodeId);
    if (!nodeToDeleteObj) return;

    // Prevent deleting the root node
    if (nodeToDeleteObj.data.isRoot) {
      setErrorMessage("لا يمكن حذف العقدة الرئيسية للشجرة!"); // Arabic: "Cannot delete the root node of the tree!"
      return;
    }

    const descendants = getDescendants(nodeId, nodes);
    const targetsToDelete = [nodeId, ...descendants];

    setNodes((currentNodes) => {
      const parentId = nodeToDeleteObj.data.parentId;
      const remainingNodes = currentNodes.filter((n) => !targetsToDelete.includes(n.id));

      // If the parent of deleted node now has no other children, mark it as collapsed (expanded = false)
      if (parentId) {
        const hasOtherChildren = remainingNodes.some((n) => n.data.parentId === parentId);
        if (!hasOtherChildren) {
          return remainingNodes.map((n) =>
            n.id === parentId ? { ...n, data: { ...n.data, expanded: false } } : n
          );
        }
      }
      return remainingNodes;
    });

    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          !targetsToDelete.includes(edge.source) &&
          !targetsToDelete.includes(edge.target)
      )
    );

    // Deselect if active
    const deletedNodesList = nodes.filter((n) => targetsToDelete.includes(n.id));
    const wasSelectedDeleted = deletedNodesList.some((n) => n.data.selected);
    if (wasSelectedDeleted) {
      onSelectWord("");
    }
  }, [nodes, setNodes, setEdges, onSelectWord]);

  // Trigger delete flow: immediately delete if ignored, else show modal
  const triggerDeleteFlow = useCallback((nodeId: string) => {
    const nodeObj = nodes.find(n => n.id === nodeId);
    if (!nodeObj) return;

    if (nodeObj.data.isRoot) {
      setErrorMessage("لا يمكن حذف العقدة الرئيسية للشجرة!");
      return;
    }

    const isIgnored = sessionStorage.getItem("ignore_delete_confirm") === "true";
    if (isIgnored) {
      handleDeleteNode(nodeId);
    } else {
      setNodeToDelete(nodeObj);
      setShowDeleteConfirm(true);
    }
  }, [nodes, handleDeleteNode]);

  // Window-level listener for Backspace and Delete keys on non-input elements
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (hoveredNodeRef.current) {
          e.preventDefault();
          triggerDeleteFlow(hoveredNodeRef.current.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerDeleteFlow]);

  // Refs to track drag state for moving children with parent
  const dragStartPos = useRef<{ x: number, y: number } | null>(null);
  const descendantStartPositions = useRef<Record<string, { x: number, y: number }>>({});

  const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
    dragStartPos.current = { ...node.position };
    descendantStartPositions.current = {};
    
    // Find all descendants
    const descendants = getDescendants(node.id, nodes);
    descendants.forEach((id) => {
      const descNode = nodes.find((n) => n.id === id);
      if (descNode) {
        descendantStartPositions.current[id] = { ...descNode.position };
      }
    });
  }, [nodes]);

  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    if (!dragStartPos.current) return;
    
    const dx = node.position.x - dragStartPos.current.x;
    const dy = node.position.y - dragStartPos.current.y;
    
    setNodes((currentNodes) =>
      currentNodes.map((n) => {
        const startPos = descendantStartPositions.current[n.id];
        if (startPos) {
          return {
            ...n,
            position: {
              x: startPos.x + dx,
              y: startPos.y + dy,
            },
          };
        }
        return n;
      })
    );
  }, [setNodes]);

  const onNodeDragStop = useCallback(() => {
    dragStartPos.current = null;
    descendantStartPositions.current = {};
  }, []);

  // Handle setting a node as the chosen brand name
  const handleNodeSelect = useCallback((word: string, nodeId: string) => {
    onSelectWord(word);
    
    // Update nodes state to highlight the selected one
    setNodes((currentNodes) =>
      currentNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          selected: n.id === nodeId,
        },
      }))
    );
  }, [onSelectWord, setNodes]);

  // Primary API trigger to expand/branch from a node
  const handleExpand = useCallback(
    async (nodeId: string, constraints: { letter_count: number | null; tone: string | null; mode?: "derivatives" | "plurals" | null }) => {
      // Find the current node
      let targetNode: Node | undefined;
      setNodes((currentNodes) => {
        targetNode = currentNodes.find((n) => n.id === nodeId);
        if (!targetNode || targetNode.data.loading) return currentNodes;

        // Set loading state
        return currentNodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, loading: true } }
            : n
        );
      });

      // Give React state a split-second to propagate
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!targetNode) return;

      const currentData = targetNode.data as unknown as BrandNodeData;
      const targetWord = currentData.word;

      try {
        setErrorMessage(null);
        let suggestions: { word: string; transliteration: string }[] = [];

        if (isFakeModeRef.current) {
          // Simulate short latency for a authentic feel
          await new Promise((resolve) => setTimeout(resolve, 350));

          // Shuffle the pre-defined MOCK_TEST_WORDS array and grab 5 items (matching MAX_SUGGESTIONS = 5)
          const shuffled = [...MOCK_TEST_WORDS].sort(() => 0.5 - Math.random());
          suggestions = shuffled.slice(0, 5);
        } else {
          const response = await fetch("/api/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              word: targetWord,
              letter_count: constraints.letter_count,
              tone: constraints.tone,
              mode: constraints.mode,
              provider: toProviderRequest(loadAIProviderSettings()),
            }),
          });

          const data = await response.json();
          if (data.success && Array.isArray(data.suggestions)) {
            suggestions = data.suggestions;
          }
        }

        if (suggestions.length > 0) {

          // Compute mathematical angles and positions for child nodes
          const parentX = targetNode.position.x;
          const parentY = targetNode.position.y;
          const numChildren = suggestions.length;

          let baseAngle = 0;
          let isOutgoingFan = false;

          // Determine branching direction based on relationship with parent node
          if (!currentData.isRoot && currentData.parentId) {
            // Find parent to compute outgoing direction vector
            const parentNode = nodes.find((n) => n.id === currentData.parentId);
            if (parentNode) {
              const dx = parentX - parentNode.position.x;
              const dy = parentY - parentNode.position.y;
              if (dx !== 0 || dy !== 0) {
                baseAngle = Math.atan2(dy, dx);
                isOutgoingFan = true;
              }
            }
          }

          const newNodes: Node[] = [];
          const newEdges: Edge[] = [];

          // Downward-facing fan pattern (sweep arc of 140 degrees centered straight down)
          const sweep = (140 * Math.PI) / 180;
          const centerAngle = Math.PI / 2; // Straight down

          // Gather all existing node positions to prevent overlaps
          const positionsToAvoid = nodes.map((n) => ({ x: n.position.x, y: n.position.y }));

          suggestions.forEach((childItem, index) => {
            const childWord = childItem.word;
            const childTranslit = childItem.transliteration;
            const childId = `node-${nodeId}-${index}-${Date.now()}`;
            let angle = 0;

            if (numChildren === 1) {
              angle = centerAngle;
            } else {
              angle = centerAngle - sweep / 2 + (index * sweep) / (numChildren - 1);
            }

            let posX = parentX + BRANCH_DISTANCE * Math.cos(angle);
            let posY = parentY + BRANCH_DISTANCE * Math.sin(angle);

            // Dynamically push the child node away from any overlaps
            const resolved = resolveOverlaps(posX, posY, positionsToAvoid, 160);
            posX = resolved.x;
            posY = resolved.y;

            // Register this position so subsequent children do not overlap with it either
            positionsToAvoid.push({ x: posX, y: posY });

            newNodes.push({
              id: childId,
              type: "brandNode",
              position: { x: posX, y: posY },
              data: {
                word: childWord,
                transliteration: childTranslit,
                parentId: nodeId,
                isRoot: false,
                loading: false,
                expanded: false,
                tone: constraints.tone,
                letter_count: constraints.letter_count,
                onExpand: (nid, subConstraints) => {
                  if (handleExpandRef.current) {
                    handleExpandRef.current(nid, subConstraints);
                  }
                },
                onSelect: (w, nid) => selectRef.current?.(w, nid),
                onRegenerate: (nid, subConstraints) => {
                  if (regenerateRef.current) {
                    regenerateRef.current(nid, subConstraints);
                  }
                },
                onEditWord: (nid, newW) => handleEditWord(nid, newW),
              },
            });

            newEdges.push({
              id: `edge-${nodeId}-${childId}`,
              source: nodeId,
              target: childId,
              type: edgeType,
              style: { 
                stroke: "#cbd5e1", 
                strokeWidth: 2,
                strokeDasharray: isEdgeDashed ? "5, 5" : undefined
              },
              animated: isEdgeDashed,
              pathOptions: edgeType === "smoothstep" ? { borderRadius: 16 } : undefined,
            } as any);
          });

          // Update nodes and edges in graph state
          setNodes((currentNodes) => {
            const updatedNodes = currentNodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, loading: false, expanded: true } }
                : n
            );
            return [...updatedNodes, ...newNodes];
          });

          setEdges((currentEdges) => [...currentEdges, ...newEdges]);
        } else {
          // Empty state: handle gracefully (e.g. prompt constraint issue)
          setErrorMessage(`No matching Arabic brand names found with current filters for "${targetWord}". Try relaxing letter counts or choosing another word!`);
          setNodes((currentNodes) =>
            currentNodes.map((n) =>
              n.id === nodeId
                ? { ...n, data: { ...n.data, loading: false } }
                : n
            )
          );
        }
      } catch (error) {
        console.error("Expand branching failed:", error);
        setErrorMessage("Network error or server timeout. Please check your connection and try again.");
        setNodes((currentNodes) =>
          currentNodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, loading: false } }
              : n
          )
        );
      }
    },
    [nodes, setNodes, setEdges, handleNodeSelect, edgeType, isEdgeDashed]
  );

  // Trigger regeneration of a node's children by clearing descendants and running handleExpand again
  const handleRegenerate = useCallback(
    async (nodeId: string, constraints: { letter_count: number | null; tone: string | null; mode?: "derivatives" | "plurals" | null }) => {
      // 1. Get descendants of this node
      const descendants = getDescendants(nodeId, nodes);

      // 2. Clear those descendant nodes and edges, set the target node as NOT expanded and NOT loading
      setNodes((currentNodes) => {
        return currentNodes
          .filter((n) => !descendants.includes(n.id))
          .map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, loading: false, expanded: false } }
              : n
          );
      });

      setEdges((currentEdges) => {
        return currentEdges.filter(
          (edge) => !descendants.includes(edge.source) && !descendants.includes(edge.target) && edge.source !== nodeId
        );
      });

      // Give React state a moment to apply the deletion
      await new Promise((resolve) => setTimeout(resolve, 80));

      // 3. Trigger handleExpand which will set loading to true and fetch fresh results
      handleExpand(nodeId, constraints);
    },
    [nodes, setNodes, setEdges, handleExpand]
  );

  // Keep the ref updated so handleExpand and resetTree can call it safely
  React.useEffect(() => {
    regenerateRef.current = handleRegenerate;
  }, [handleRegenerate]);

  React.useEffect(() => {
    handleExpandRef.current = handleExpand;
  }, [handleExpand]);

  React.useEffect(() => {
    selectRef.current = handleNodeSelect;
  }, [handleNodeSelect]);

  // Handle editing a node's word directly in tree state
  const handleEditWord = useCallback((nodeId: string, newWord: string) => {
    const isArabic = /^[\u0600-\u06FF]/.test(newWord.trim());
    if (!isArabic) {
      setErrorMessage("عذراً، يجب أن تبدأ الكلمة المُعدلة بحرف عربي!");
      return false;
    }

    setNodes((currentNodes) =>
      currentNodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                word: newWord,
                transliteration: undefined, // reset to force recalculation of transliteration
              },
            }
          : n
      )
    );
    return true;
  }, [setNodes]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Serialize the current tree into a plain, storable payload (shared by file save + autosave).
  const serializeProject = useCallback(() => ({
    version: "1.0.0",
    rootWord,
    selectedWord,
    favorites,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        word: n.data.word,
        transliteration: n.data.transliteration,
        parentId: n.data.parentId,
        isRoot: n.data.isRoot,
        expanded: n.data.expanded,
        tone: n.data.tone,
        letter_count: n.data.letter_count,
        selected: n.data.selected,
      },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  }), [rootWord, selectedWord, favorites, nodes, edges]);

  // Rebuild live nodes/edges (with callbacks re-attached) from a serialized payload and apply them.
  const applyProjectData = useCallback((data: any): boolean => {
    if (!data || typeof data !== "object") return false;
    if (!data.rootWord || !Array.isArray(data.nodes)) return false;

    const isArabic = /^[؀-ۿ]/.test(String(data.rootWord).trim());
    if (!isArabic) {
      setErrorMessage("عذراً، يجب أن يبدأ المشروع المُحمّل بكلمة جذر عربية!");
      return false;
    }

    const reconstructedNodes: Node[] = data.nodes.map((n: any) => ({
      id: n.id,
      type: n.type || "brandNode",
      position: n.position,
      data: {
        word: n.data.word,
        transliteration: n.data.transliteration,
        parentId: n.data.parentId,
        isRoot: n.data.isRoot,
        expanded: n.data.expanded,
        tone: n.data.tone,
        letter_count: n.data.letter_count,
        selected: n.data.selected,
        onExpand: (nid: string, constraints: any) => {
          if (handleExpandRef.current) {
            handleExpandRef.current(nid, constraints);
          }
        },
        onSelect: (w: string, nid: string) => selectRef.current?.(w, nid),
        onRegenerate: (nid: string, subConstraints: any) => {
          if (regenerateRef.current) {
            regenerateRef.current(nid, subConstraints);
          }
        },
        onEditWord: (nid: string, newW: string) => handleEditWord(nid, newW),
      },
    }));

    const reconstructedEdges: Edge[] = (data.edges || []).map((e: any) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: edgeType,
      style: {
        stroke: "#cbd5e1",
        strokeWidth: 2,
        strokeDasharray: isEdgeDashed ? "5, 5" : undefined,
      },
      animated: isEdgeDashed,
    }));

    setNodes(reconstructedNodes);
    setEdges(reconstructedEdges);
    setErrorMessage(null);

    const loadedFavs = Array.isArray(data.favorites) ? data.favorites : [];
    const loadedSelected = typeof data.selectedWord === "string" ? data.selectedWord : null;
    onLoadProject?.(data.rootWord, loadedFavs, loadedSelected);
    return true;
  }, [edgeType, isEdgeDashed, handleNodeSelect, handleEditWord, setNodes, setEdges, onLoadProject]);

  // Load the auto-persisted last session from localStorage.
  const handleLoadLastTree = useCallback(() => {
    try {
      const raw = localStorage.getItem(LAST_TREE_STORAGE_KEY);
      if (!raw) {
        setErrorMessage("لا يوجد عمل محفوظ سابقاً على هذا الجهاز.");
        return;
      }
      const ok = applyProjectData(JSON.parse(raw));
      if (!ok) {
        setErrorMessage("عذراً، تعذّر استرجاع العمل المحفوظ.");
      }
    } catch (err) {
      console.error("Failed to load last tree:", err);
      setErrorMessage("عذراً, تعذّر استرجاع العمل المحفوظ.");
    }
  }, [applyProjectData]);

  const handleRemoveDuplicates = useCallback(() => {
    // Depth of a node = distance from root, walking the parentId chain.
    const depthOf = (node: Node): number => {
      let depth = 0;
      let current = node;
      while (current.data.parentId) {
        const parent = nodes.find((n) => n.id === current.data.parentId);
        if (!parent) break;
        current = parent;
        depth++;
      }
      return depth;
    };

    // Group nodes by word; keep the shallowest (closest to root) as the parent-priority winner.
    const byWord = new Map<string, Node[]>();
    for (const node of nodes) {
      const word = node.data.word as string;
      if (!byWord.has(word)) byWord.set(word, []);
      byWord.get(word)!.push(node);
    }

    const targetsToDelete = new Set<string>();
    for (const group of byWord.values()) {
      if (group.length < 2) continue;
      const sorted = [...group].sort((a, b) => depthOf(a) - depthOf(b));
      // Keep sorted[0] (shallowest); remove the rest along with their descendants.
      for (const dup of sorted.slice(1)) {
        if (dup.data.isRoot) continue; // never remove the root
        targetsToDelete.add(dup.id);
        for (const descId of getDescendants(dup.id, nodes)) targetsToDelete.add(descId);
      }
    }

    if (targetsToDelete.size === 0) {
      setErrorMessage("لا توجد أسماء مكررة في الشجرة.");
      return;
    }

    setNodes((currentNodes) => {
      const remaining = currentNodes.filter((n) => !targetsToDelete.has(n.id));
      // Collapse parents that lost all their children.
      return remaining.map((n) =>
        n.data.expanded && !remaining.some((c) => c.data.parentId === n.id)
          ? { ...n, data: { ...n.data, expanded: false } }
          : n
      );
    });

    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => !targetsToDelete.has(edge.source) && !targetsToDelete.has(edge.target)
      )
    );
  }, [nodes, setNodes, setEdges]);

  const handleAutoLayout = useCallback(() => {
    const root = nodes.find((n) => n.data.isRoot);
    if (!root) return;

    const H_SPACING = 165; // horizontal gap between sibling subtrees (compact)
    const V_SPACING = 190; // vertical gap between depth levels (compact)

    const childrenOf = (id: string) =>
      nodes.filter((n) => n.data.parentId === id);

    // Classic tidy-tree pass: leaves get sequential x slots, parents center over children.
    const positions = new Map<string, { x: number; y: number }>();
    let nextLeafX = 0;

    const assign = (nodeId: string, depth: number): number => {
      const children = childrenOf(nodeId);
      const y = depth * V_SPACING;
      let x: number;
      if (children.length === 0) {
        x = nextLeafX * H_SPACING;
        nextLeafX++;
      } else {
        const childXs = children.map((c) => assign(c.id, depth + 1));
        x = (childXs[0] + childXs[childXs.length - 1]) / 2;
      }
      positions.set(nodeId, { x, y });
      return x;
    };
    assign(root.id, 0);

    // Keep the root anchored at its current position; shift the whole tree by the delta.
    const rootPos = positions.get(root.id)!;
    const dx = root.position.x - rootPos.x;
    const dy = root.position.y - rootPos.y;

    setNodes((currentNodes) =>
      currentNodes.map((n) => {
        const p = positions.get(n.id);
        return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n;
      })
    );

    // Let the position updates commit before reframing the viewport.
    setTimeout(() => fitView({ duration: 500, padding: 0.2 }), 50);
  }, [nodes, setNodes, fitView]);

  const handleCompactLayout = useCallback(() => {
    const root = nodes.find((n) => n.data.isRoot);
    if (!root) return;

    const childrenMap = new Map<string, string[]>();
    for (const n of nodes) {
      const pid = n.data.parentId as string | undefined;
      if (!pid) continue;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(n.id);
    }

    const NODE_SIZE = 96; // BrandNode is w-24 h-24
    const GAP = 28;
    const { pos } = packSubtree(root.id, childrenMap, NODE_SIZE, GAP);

    // Keep the root anchored at its current position; shift the whole tree by the delta.
    const rootPos = pos.get(root.id)!;
    const dx = root.position.x - rootPos.x;
    const dy = root.position.y - rootPos.y;

    setNodes((currentNodes) =>
      currentNodes.map((n) => {
        const p = pos.get(n.id);
        return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n;
      })
    );

    setTimeout(() => fitView({ duration: 500, padding: 0.2 }), 50);
  }, [nodes, setNodes, fitView]);

  const handleSaveProject = useCallback(() => {
    try {
      const projectPayload = serializeProject();

      const jsonString = JSON.stringify(projectPayload, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${rootWord || "brand-tree"}-project.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to save project:", err);
      setErrorMessage("عذراً، فشل حفظ المشروع.");
    }
  }, [serializeProject, rootWord]);

  const handleOpenProjectClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleLoadProjectFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        if (!data || typeof data !== "object") {
          throw new Error("Invalid file content");
        }
        if (!data.rootWord || !Array.isArray(data.nodes)) {
          throw new Error("Missing required project fields");
        }

        const isArabic = /^[\u0600-\u06FF]/.test(data.rootWord.trim());
        if (!isArabic) {
          setErrorMessage("عذراً، يجب أن يبدأ المشروع المُحمّل بكلمة جذر عربية!");
          return;
        }

        applyProjectData(data);
      } catch (err) {
        console.error("Failed to load project:", err);
        setErrorMessage("عذراً، فشل تحميل ملف المشروع. تأكد من صحة الملف.");
      } finally {
        if (event.target) {
          event.target.value = "";
        }
      }
    };
    reader.readAsText(file);
  }, [applyProjectData]);

  // Initialize/Reset the tree with a new root word
  const resetTree = useCallback((word: string) => {
    const rootNodeId = "root";
    const initialNode: Node = {
      id: rootNodeId,
      type: "brandNode",
      position: { x: 400, y: 300 },
      data: {
        word,
        isRoot: true,
        loading: false,
        expanded: false,
        autoEdit: autoEditRoot,
        onExpand: (nodeId, constraints) => {
          if (handleExpandRef.current) {
            handleExpandRef.current(nodeId, constraints);
          }
        },
        onSelect: (w, nodeId) => selectRef.current?.(w, nodeId),
        onRegenerate: (nid, subConstraints) => {
          if (regenerateRef.current) {
            regenerateRef.current(nid, subConstraints);
          }
        },
        onEditWord: (nid, newW) => handleEditWord(nid, newW),
      },
    };

    setNodes([initialNode]);
    setEdges([]);
    setErrorMessage(null);
  }, [setNodes, setEdges, handleExpand, handleNodeSelect, autoEditRoot]);

  // Auto-initialize tree if not already initialized
  React.useEffect(() => {
    if (nodes.length === 0 && rootWord) {
      resetTree(rootWord);
    }
  }, [rootWord, nodes.length, resetTree]);

  // Keep each node's favorite-heart state in sync with the favorites list (independent of tree selection)
  React.useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((n) => ({
        ...n,
        data: { ...n.data, isFavorite: favorites.includes(n.data.word as string) },
      }))
    );
  }, [favorites, setNodes]);

  // Auto-persist the current session to localStorage so work survives a refresh/close.
  // Hold on the first landing (only the initial root node exists) so a fresh start
  // doesn't clobber a previously saved session before the user restores it.
  React.useEffect(() => {
    if (nodes.length <= 1) return;
    try {
      localStorage.setItem(LAST_TREE_STORAGE_KEY, JSON.stringify(serializeProject()));
    } catch (err) {
      console.error("Failed to auto-save tree:", err);
    }
  }, [nodes, edges, favorites, selectedWord, rootWord, serializeProject]);

  // Synchronize edge types and line styles dynamically for existing edges
  React.useEffect(() => {
    setEdges((prevEdges) =>
      prevEdges.map((edge) => ({
        ...edge,
        type: edgeType,
        style: {
          ...edge.style,
          strokeDasharray: isEdgeDashed ? "5, 5" : undefined,
        },
        animated: isEdgeDashed,
        pathOptions: edgeType === "smoothstep" ? { borderRadius: 16 } : undefined,
      } as any))
    );
  }, [edgeType, isEdgeDashed, setEdges]);

  // Clean, custom edge styling for React Flow
  const defaultEdgeOptions = useMemo(() => ({
    style: { stroke: "#cbd5e1", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#cbd5e1",
      width: 14,
      height: 14,
    },
  }), []);

  return (
    <div className="w-full h-full relative">
      
      {/* Visual Error Message banner */}
      {errorMessage && (
        <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 bg-accent-bg border-2 border-accent text-text-main text-xs px-4 py-3 rounded-2xl flex items-center gap-2 z-50 max-w-lg">
          <Sparkles className="w-4 h-4 text-accent shrink-0" />
          <span className="font-medium">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-accent hover:text-accent-hover font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Guide Help Info Button */}
      <div 
        className="absolute bottom-4 left-4 z-45 flex flex-col items-start gap-2 font-sans"
        onMouseEnter={() => setShowGuide(true)}
        onMouseLeave={() => setShowGuide(false)}
      >
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-bg-panel/95 backdrop-blur-md border-2 border-border-main rounded-2xl p-3 max-w-[250px] text-[11px] text-text-muted space-y-1.5 shadow-xl"
            >
              <div className="flex items-center gap-1.5 font-bold text-text-main pb-1 border-b border-border-main/40">
                <HelpCircle className="w-3.5 h-3.5 text-accent" />
                <span className="font-display">إرشادات التصفح</span>
              </div>
              <p dir="rtl" className="text-right font-medium leading-relaxed">
                • حرك المؤشر فوق الكلمة لتظهر أقمار التحكم والخيارات.
              </p>
              <p dir="rtl" className="text-right font-medium leading-relaxed">
                • اضغط على <span className="text-accent font-semibold">عدد الحروف (#)</span> أو <span className="text-accent font-semibold">النبرة (✨)</span> لفلترة النتائج.
              </p>
              <p dir="rtl" className="text-right font-medium leading-relaxed">
                • اضغط على زر <span className="text-accent font-semibold">المشتقات (تفرع)</span> أو <span className="text-accent font-semibold">الجموع (طبقات)</span> للتحويل لمسار توليد صرفي مخصص دقيق ومضمون.
              </p>
              <p dir="rtl" className="text-right font-medium leading-relaxed">
                • اضغط على <span className="text-accent font-semibold">الكلمة نفسها</span> لتفريغ الشجرة وتوليد فروع مذهلة!
              </p>
              <p dir="rtl" className="text-right font-medium leading-relaxed">
                • اضغط على <span className="text-accent font-semibold">القلب (♥)</span> لحفظ الاسم في قائمة المرشحات الجانبية.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-8 h-8 rounded-full bg-bg-panel hover:bg-bg-page border-2 border-border-main flex items-center justify-center text-accent cursor-pointer transition-all hover:scale-105 shadow-sm"
          title="إرشادات التصفح"
        >
          <HelpCircle className="w-4 h-4 stroke-[2px]" />
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        proOptions={{ hideAttribution: true }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        className="w-full h-full"
        onNodeMouseEnter={(event, node) => setHoveredNode(node)}
        onNodeMouseLeave={(event, node) => setHoveredNode((prev) => prev?.id === node.id ? null : prev)}
        deleteKeyCode={null}
      >
        <Background color="#cbd5e1" gap={16} size={1} />
        <Controls position="bottom-right" showInteractive={false} className="bg-bg-panel rounded-2xl border-2 border-border-main text-text-muted" />
      </ReactFlow>

      {/* Cleanup tools (standalone, top-left) */}
      <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
        <Tooltip content="إزالة الأسماء المكررة (Remove Duplicate Names)" position="bottom" align="start">
          <button
            onClick={handleRemoveDuplicates}
            className="bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main h-10 w-10 rounded-xl border-2 border-border-main flex items-center justify-center cursor-pointer transition-colors shadow-sm"
          >
            <Eraser className="w-4 h-4 text-accent" />
          </button>
        </Tooltip>

        <Tooltip content="إعادة ترتيب وتنظيم الشجرة (Auto-arrange Tree)" position="bottom" align="start">
          <button
            onClick={handleAutoLayout}
            className="bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main h-10 w-10 rounded-xl border-2 border-border-main flex items-center justify-center cursor-pointer transition-colors shadow-sm"
          >
            <Network className="w-4 h-4 text-accent" />
          </button>
        </Tooltip>

        <Tooltip content="ترتيب مضغوط بأصغر مساحة (Compact Arrange)" position="bottom" align="center">
          <button
            onClick={handleCompactLayout}
            className="bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main h-10 w-10 rounded-xl border-2 border-border-main flex items-center justify-center cursor-pointer transition-colors shadow-sm"
          >
            <Shrink className="w-4 h-4 text-accent" />
          </button>
        </Tooltip>
      </div>

      {/* Project State Utilities: Load, Save, Reset */}
      <div className="absolute top-4 right-[192px] z-40 flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleLoadProjectFile}
          accept=".json"
          className="hidden"
        />

        <Tooltip content="تحميل مشروع من جهازك (Open/Load Project)" position="bottom" align="end">
          <button
            onClick={handleOpenProjectClick}
            className="bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main h-10 w-10 rounded-xl border-2 border-border-main flex items-center justify-center cursor-pointer transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4 text-accent" />
          </button>
        </Tooltip>

        <Tooltip content="حفظ المشروع الحالي (Save Project)" position="bottom" align="end">
          <button
            onClick={handleSaveProject}
            className="bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main h-10 w-10 rounded-xl border-2 border-border-main flex items-center justify-center cursor-pointer transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 text-accent" />
          </button>
        </Tooltip>

        <Tooltip content="استرجاع آخر عمل محفوظ (Load Last Tree)" position="bottom" align="end">
          <button
            onClick={handleLoadLastTree}
            className="bg-bg-panel hover:bg-bg-page text-text-muted hover:text-text-main h-10 w-10 rounded-xl border-2 border-border-main flex items-center justify-center cursor-pointer transition-colors shadow-sm"
          >
            <History className="w-4 h-4 text-accent" />
          </button>
        </Tooltip>

      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && nodeToDelete && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            />
            
            {/* Modal Card */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-bg-panel border-2 border-border-main rounded-3xl p-6 shadow-2xl max-w-md w-full text-right font-sans z-10"
              dir="rtl"
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border-2 border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-text-main mb-1">
                    تأكيد حذف العقدة (Confirm Node Deletion)
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed">
                    هل أنت متأكد من حذف الكلمة <span className="font-bold text-rose-600">"{nodeToDelete.data.word}"</span>؟ سيؤدي ذلك إلى حذف جميع العقد الفرعية المتفرعة منها بشكل نهائي.
                  </p>
                </div>
              </div>

              {/* Option to ignore confirm modal this session */}
              <div className="flex items-center gap-2.5 px-3 py-3 bg-bg-page border border-border-main/50 rounded-2xl mb-5 select-none text-right">
                <input
                  id="ignore-confirm-checkbox"
                  type="checkbox"
                  checked={ignoreConfirm}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIgnoreConfirm(checked);
                    if (checked) {
                      sessionStorage.setItem("ignore_delete_confirm", "true");
                    } else {
                      sessionStorage.removeItem("ignore_delete_confirm");
                    }
                  }}
                  className="w-4 h-4 rounded border-border-main text-accent focus:ring-accent accent-accent cursor-pointer shrink-0"
                />
                <label
                  htmlFor="ignore-confirm-checkbox"
                  className="text-[11px] font-bold text-text-muted cursor-pointer leading-normal"
                >
                  تخطي هذا التأكيد لهذه الجلسة وحذف العقد مباشرة عند الضغط على زر Delete
                </label>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-bg-page border-2 border-border-main hover:bg-neutral-50 text-text-muted hover:text-text-main font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  إلغاء (Cancel)
                </button>
                <button
                  onClick={() => {
                    if (nodeToDelete) {
                      handleDeleteNode(nodeToDelete.id);
                      setShowDeleteConfirm(false);
                    }
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs border border-rose-700 transition-colors cursor-pointer"
                >
                  تأكيد الحذف (Delete)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
