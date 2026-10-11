"use client";

import { useState, useEffect } from "react";
import type { NodeType } from "@/lib/types";
import { api } from "@/lib/api";
import { NODE_LABELS, NODE_ICONS, CATEGORY_STYLES, getCategory } from "./workflow-node";
import { Database, Users, Loader2 } from "lucide-react";

interface NodePaletteProps {
  onAddNode: (type: NodeType, config?: Record<string, unknown>) => void;
}

interface DataSource {
  id: string;
  name: string;
  status?: string;
}

interface DataSourcesResponse {
  campaigns: DataSource[];
  lead_lists: DataSource[];
}

const PALETTE_SECTIONS: { title: string; category: string; types: NodeType[] }[] = [
  {
    title: "Triggers",
    category: "trigger",
    types: [
      "trigger_manual", "trigger_new_lead", "trigger_list_membership_added",
      "trigger_inbound_webhook", "trigger_cron",
    ],
  },
  {
    title: "Outreach",
    category: "outreach",
    types: ["email_send", "linkedin_connect", "linkedin_message", "auto_respond"],
  },
  {
    title: "Logic",
    category: "logic",
    types: ["if", "switch", "merge", "wait", "end"],
  },
  {
    title: "Integrations",
    category: "integration",
    types: ["http_request", "outgoing_webhook"],
  },
  {
    title: "AI",
    category: "ai",
    types: ["ai_generate_message", "ai_classify_reply", "ai_extract_fields", "ai_decision"],
  },
  {
    title: "Collaboration",
    category: "collaboration",
    types: ["add_note", "create_task", "approval_gate"],
  },
];

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [dataSources, setDataSources] = useState<DataSourcesResponse | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<DataSourcesResponse>("/api/workflows/data-sources");
        if (!cancelled) setDataSources(data);
      } catch {
        // Silently fail — data section just won't show
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const dataStyle = CATEGORY_STYLES.data;

  return (
    <div className="w-56 border-r bg-card/50 overflow-y-auto p-3 space-y-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        Nodes
      </h3>

      {/* Data Sources section */}
      <div>
        <h4 className="text-[11px] font-semibold text-indigo-600 mb-1.5 px-1">
          Data Sources
        </h4>
        {loadingData ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        ) : (
          <div className="space-y-1">
            {dataSources?.campaigns.map((c) => (
              <button
                key={`campaign-${c.id}`}
                onClick={() => onAddNode("data_campaign", { campaign_id: c.id, campaign_name: c.name })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs font-medium transition-colors hover:bg-indigo-50 hover:text-foreground text-muted-foreground"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/workflow-node-type", "data_campaign");
                  e.dataTransfer.setData("application/workflow-node-config", JSON.stringify({ campaign_id: c.id, campaign_name: c.name }));
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <Database className={`h-3.5 w-3.5 ${dataStyle?.icon ?? "text-indigo-600"}`} />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {dataSources?.lead_lists.map((ll) => (
              <button
                key={`list-${ll.id}`}
                onClick={() => onAddNode("data_lead_list", { list_id: ll.id, list_name: ll.name })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs font-medium transition-colors hover:bg-indigo-50 hover:text-foreground text-muted-foreground"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/workflow-node-type", "data_lead_list");
                  e.dataTransfer.setData("application/workflow-node-config", JSON.stringify({ list_id: ll.id, list_name: ll.name }));
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <Users className={`h-3.5 w-3.5 ${dataStyle?.icon ?? "text-indigo-600"}`} />
                <span className="truncate">{ll.name}</span>
              </button>
            ))}
            {dataSources && dataSources.campaigns.length === 0 && dataSources.lead_lists.length === 0 && (
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                No campaigns or lists yet
              </p>
            )}
          </div>
        )}
      </div>

      {/* Standard node sections */}
      {PALETTE_SECTIONS.map((section) => {
        const style = CATEGORY_STYLES[section.category] ?? CATEGORY_STYLES.control;
        return (
          <div key={section.title}>
            <h4 className="text-[11px] font-semibold text-muted-foreground mb-1.5 px-1">
              {section.title}
            </h4>
            <div className="space-y-1">
              {section.types.map((type) => {
                const Icon = NODE_ICONS[type];
                const cat = getCategory(type);
                const catStyle = CATEGORY_STYLES[cat] ?? style;
                return (
                  <button
                    key={type}
                    onClick={() => onAddNode(type)}
                    className={`
                      w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left
                      text-xs font-medium transition-colors
                      hover:${catStyle.bg} hover:text-foreground
                      text-muted-foreground
                    `}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/workflow-node-type", type);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    {Icon && <Icon className={`h-3.5 w-3.5 ${catStyle.icon}`} />}
                    <span className="truncate">{NODE_LABELS[type] ?? type}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
