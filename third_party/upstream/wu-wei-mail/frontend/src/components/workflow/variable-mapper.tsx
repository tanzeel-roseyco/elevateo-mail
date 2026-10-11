"use client";

import { useMemo } from "react";
import { ChevronRight, ArrowRight, AlertCircle } from "lucide-react";
import type { InputMapping, OutputDeclaration, WorkflowNode as WFNode } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────
interface ContextTreeNode {
  label: string;
  path: string;
  type?: string;
  children?: ContextTreeNode[];
}

interface VariableMapperProps {
  mappings: InputMapping[];
  upstreamNodes: WFNode[];
  leadFields?: string[];
  onChange: (mappings: InputMapping[]) => void;
}

// ─── Default lead fields ────────────────────────────────────
const DEFAULT_LEAD_FIELDS: ContextTreeNode[] = [
  { label: "id", path: "lead.id", type: "string" },
  { label: "email", path: "lead.email", type: "string" },
  { label: "first_name", path: "lead.first_name", type: "string" },
  { label: "last_name", path: "lead.last_name", type: "string" },
  { label: "company", path: "lead.company", type: "string" },
  { label: "title", path: "lead.title", type: "string" },
  { label: "linkedin_url", path: "lead.linkedin_url", type: "string" },
  { label: "phone", path: "lead.phone", type: "string" },
];

const TRIGGER_FIELDS: ContextTreeNode[] = [
  { label: "type", path: "trigger.type", type: "string" },
  { label: "payload", path: "trigger.payload", type: "object" },
];

// ─── Build context tree from upstream nodes ─────────────────
function buildContextTree(upstreamNodes: WFNode[], leadFields?: string[]): ContextTreeNode[] {
  const tree: ContextTreeNode[] = [];

  // Lead fields
  const leadChildren = leadFields?.length
    ? leadFields.map((f) => ({ label: f, path: `lead.${f}`, type: "string" }))
    : DEFAULT_LEAD_FIELDS;
  tree.push({ label: "lead", path: "lead", children: leadChildren });

  // Trigger fields
  tree.push({ label: "trigger", path: "trigger", children: TRIGGER_FIELDS });

  // Vars
  tree.push({ label: "vars", path: "vars", children: [] });

  // Node outputs from upstream nodes
  if (upstreamNodes.length > 0) {
    const nodeOutputChildren: ContextTreeNode[] = upstreamNodes.map((n) => {
      const outputSchema = n.output_schema ?? [];
      const children = outputSchema.map((o: OutputDeclaration) => ({
        label: o.key,
        path: `node_outputs.${n.id}.${o.key}`,
        type: o.type,
      }));
      return {
        label: n.name || n.id,
        path: `node_outputs.${n.id}`,
        children,
      };
    });
    tree.push({ label: "node_outputs", path: "node_outputs", children: nodeOutputChildren });
  }

  return tree;
}

// ─── Tree item component ────────────────────────────────────
function TreeItem({
  node,
  depth = 0,
  onSelect,
}: {
  node: ContextTreeNode;
  depth?: number;
  onSelect: (path: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isLeaf = !hasChildren;

  return (
    <div>
      <button
        type="button"
        onClick={() => isLeaf && onSelect(node.path)}
        className={`
          flex items-center gap-1 w-full text-left px-2 py-0.5 text-[11px] rounded
          hover:bg-accent/50 transition-colors
          ${isLeaf ? "cursor-pointer" : "cursor-default font-medium"}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="truncate">{node.label}</span>
        {node.type && (
          <span className="ml-auto text-[9px] text-muted-foreground bg-muted rounded px-1">
            {node.type}
          </span>
        )}
      </button>
      {hasChildren &&
        node.children!.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} onSelect={onSelect} />
        ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────
export function VariableMapper({ mappings, upstreamNodes, leadFields, onChange }: VariableMapperProps) {
  const tree = useMemo(() => buildContextTree(upstreamNodes, leadFields), [upstreamNodes, leadFields]);

  const addMapping = (sourcePath: string) => {
    const existing = mappings.find((m) => m.source === sourcePath);
    if (existing) return;
    onChange([...mappings, { source: sourcePath, target: "", transform: "", required: true }]);
  };

  const updateMapping = (index: number, updates: Partial<InputMapping>) => {
    const updated = mappings.map((m, i) => (i === index ? { ...m, ...updates } : m));
    onChange(updated);
  };

  const removeMapping = (index: number) => {
    onChange(mappings.filter((_, i) => i !== index));
  };

  return (
    <div className="flex gap-3 h-full">
      {/* Left: Context tree */}
      <div className="w-1/2 border rounded-lg overflow-y-auto bg-muted/30">
        <div className="px-2 py-1.5 border-b bg-muted/50">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Available Variables
          </span>
        </div>
        <div className="py-1">
          {tree.map((node) => (
            <TreeItem key={node.path} node={node} onSelect={addMapping} />
          ))}
        </div>
      </div>

      {/* Right: Current mappings */}
      <div className="w-1/2 border rounded-lg overflow-y-auto">
        <div className="px-2 py-1.5 border-b bg-muted/50">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Mappings ({mappings.length})
          </span>
        </div>
        <div className="p-2 space-y-2">
          {mappings.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-4">
              Click a variable on the left to add a mapping
            </p>
          )}
          {mappings.map((m, i) => (
            <div key={i} className="flex items-center gap-1 text-[11px] bg-muted/30 rounded p-1.5">
              <span className="font-mono text-[10px] text-blue-600 truncate flex-1" title={m.source}>
                {m.source}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={m.target}
                onChange={(e) => updateMapping(i, { target: e.target.value })}
                placeholder="config field"
                className="flex-1 bg-background border rounded px-1.5 py-0.5 text-[10px] min-w-0"
              />
              {!m.target && (
                <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />
              )}
              <button
                type="button"
                onClick={() => removeMapping(i)}
                className="text-destructive hover:text-destructive/80 text-[10px] px-1"
              >
                x
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
