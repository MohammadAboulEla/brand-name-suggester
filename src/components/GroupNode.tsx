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
          px-3 py-1
          font-bold font-sans text-sm text-accent
          bg-accent-bg
          border-2 border-accent rounded-full
          shadow-sm
        "
        dir="rtl"
      >
        {label}
      </div>

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
            h-5 w-5
            text-white
            bg-accent
            border-2 border-bg-panel rounded-full
            shadow
            hover:bg-accent-hover hover:scale-110
            -mt-1 cursor-pointer transition-all
          "
        >
          {collapsed ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </button>
      </Tooltip>
    </div>
  );
};
