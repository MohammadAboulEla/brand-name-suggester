import React, { useCallback, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BrandNode } from "./BrandNode";
import { BrandNodeData } from "../types";
import { Sparkles, HelpCircle, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const nodeTypes = {
  brandNode: BrandNode,
};

// Radial spacing distance for new children branches
const BRANCH_DISTANCE = 250;

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

interface ExplorationTreeProps {
  rootWord: string;
  onSelectWord: (word: string) => void;
  selectedWord: string | null;
}

export const ExplorationTree: React.FC<ExplorationTreeProps> = ({
  rootWord,
  onSelectWord,
  selectedWord,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const regenerateRef = useRef<any>(null);

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
        const response = await fetch("/api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: targetWord,
            letter_count: constraints.letter_count,
            tone: constraints.tone,
            mode: constraints.mode,
          }),
        });

        const data = await response.json();

        if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          const suggestions: { word: string; transliteration: string }[] = data.suggestions;

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
                onExpand: (nid, subConstraints) => handleExpand(nid, subConstraints),
                onSelect: (w, nid) => handleNodeSelect(w, nid),
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
              type: "smoothstep",
              style: { stroke: "#cbd5e1", strokeWidth: 2 },
              animated: true,
            });
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
    [nodes, setNodes, setEdges, handleNodeSelect]
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

  // Handle editing a node's word directly in tree state
  const handleEditWord = useCallback((nodeId: string, newWord: string) => {
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
  }, [setNodes]);

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
        onExpand: (nodeId, constraints) => handleExpand(nodeId, constraints),
        onSelect: (w, nodeId) => handleNodeSelect(w, nodeId),
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
  }, [setNodes, setEdges, handleExpand, handleNodeSelect]);

  // Auto-initialize tree if not already initialized
  React.useEffect(() => {
    if (nodes.length === 0 && rootWord) {
      resetTree(rootWord);
    }
  }, [rootWord, nodes.length, resetTree]);

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
        <div className="absolute top-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 bg-rose-50 border-2 border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-2xl flex items-center gap-2 z-50 animate-bounce max-w-lg">
          <Sparkles className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
          <button 
            onClick={() => setErrorMessage(null)} 
            className="ml-auto text-rose-400 hover:text-rose-600 font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Guide Help Info Button */}
      <div 
        className="absolute bottom-4 left-4 z-45 flex flex-col items-start gap-2"
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
              className="bg-white/95 backdrop-blur-md border-2 border-slate-300 rounded-2xl p-4 max-w-xs text-xs text-slate-500 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                <span>إرشادات التصفح (Guide)</span>
              </div>
              <p dir="rtl" className="text-right font-medium text-slate-600 leading-relaxed">
                • حرك الفأرة (Hover) فوق الدائرة لتظهر أقمار التحكم.
              </p>
              <p dir="rtl" className="text-right font-medium text-slate-600 leading-relaxed">
                • اضغط على أيقونة الحروف أو الأسلوب لضبط الطول أو الطابع قبل التفرع.
              </p>
              <p dir="rtl" className="text-right font-medium text-slate-600 leading-relaxed">
                • اضغط على الكلمة في الوسط لتوليد ٦ تفرعات جديدة!
              </p>
              <p dir="rtl" className="text-right font-medium text-slate-600 leading-relaxed">
                • اضغط على علامة الصح لترشيح الكلمة كعلامة مختارة.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-10 h-10 rounded-full bg-white hover:bg-slate-50 border-2 border-slate-300 flex items-center justify-center text-indigo-600 cursor-pointer transition-all hover:scale-105"
          title="إرشادات التصفح"
        >
          <HelpCircle className="w-5 h-5 stroke-[2.5px]" />
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        className="w-full h-full"
      >
        <Background color="#cbd5e1" gap={16} size={1} />
        <Controls position="bottom-right" showInteractive={false} className="bg-white rounded-2xl border-2 border-slate-200" />
      </ReactFlow>

      {/* Reset Tree Node Utility */}
      <button
        onClick={() => resetTree(rootWord)}
        className="absolute top-4 right-[134px] bg-white hover:bg-neutral-50 text-slate-600 hover:text-slate-900 px-3.5 py-2 rounded-2xl border-2 border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer z-40 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
