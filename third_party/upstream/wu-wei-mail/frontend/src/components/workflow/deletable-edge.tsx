"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  animated,
  style,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onDelete = () => {
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={20}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke: selected ? "hsl(var(--destructive))" : undefined,
        }}
        className={animated ? "react-flow__edge-path animated" : ""}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          {selected ? (
            <button
              className="flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground shadow-sm hover:scale-110 transition-transform cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete connection"
            >
              <X className="h-3 w-3" />
            </button>
          ) : label ? (
            <span className="text-[10px] bg-card border rounded px-1.5 py-0.5 text-muted-foreground shadow-sm">
              {label}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
