import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Plus, Minus } from "lucide-react";
import { GroupNodeData } from "../types";
import { Tooltip } from "./Tooltip";

export const GroupNode: React.FC<NodeProps> = ({ id, data }) => {
  const { label, collapsed, onToggleCollapse } = data as unknown as GroupNodeData;

  return (
    <div className="
      relative flex
      flex-col items-center
      select-none
    ">
      {/* Centered handles behind the rectangle so edges enter/exit at its middle */}
      <Handle
        type="target"
        position={Position.Top}
        className="
          h-1 w-1
          opacity-0
          pointer-events-none
        "
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="
          h-1 w-1
          opacity-0
          pointer-events-none
        "
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      />

      <div
        className="
          flex
          gap-1.5 items-center
          px-3 py-1
          font-bold font-sans text-sm text-accent
          bg-accent-bg
          border-2 border-accent rounded-full
          shadow-sm
        "
        dir="rtl"
      >
        {/* Collapse/expand dot: hides or shows the result subtree */}
        <Tooltip content={collapsed ? "إظهار النتائج" : "إخفاء النتائج"} position="bottom">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.(id);
            }}
            className="
              flex
              items-center justify-center
              h-4 w-4
              text-white
              bg-accent
              rounded-full
              shadow-sm
              hover:bg-accent-hover hover:scale-110
              cursor-pointer transition-all
            "
          >
            {collapsed ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
          </button>
        </Tooltip>

        <span>{label}</span>
      </div>
    </div>
  );
};
