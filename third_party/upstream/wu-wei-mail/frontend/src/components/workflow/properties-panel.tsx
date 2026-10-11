"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2, Braces } from "lucide-react";
import { NODE_LABELS, NODE_ICONS, getCategory, CATEGORY_STYLES } from "./workflow-node";
import type { WorkflowNodeData } from "./workflow-node";
import type { NodeType, ContextSchemaResponse } from "@/lib/types";
import { api } from "@/lib/api";

interface PropertiesPanelProps {
  selectedNode: Node | null;
  workflowId?: string;
  onUpdateNode: (id: string, data: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (id: string) => void;
}

export function PropertiesPanel({ selectedNode, workflowId, onUpdateNode, onDeleteNode }: PropertiesPanelProps) {
  const handleLabelChange = useCallback(
    (value: string) => {
      if (selectedNode) {
        onUpdateNode(selectedNode.id, { label: value });
      }
    },
    [selectedNode, onUpdateNode],
  );

  const handleConfigChange = useCallback(
    (key: string, value: unknown) => {
      if (!selectedNode) return;
      const data = selectedNode.data as unknown as WorkflowNodeData;
      onUpdateNode(selectedNode.id, {
        config: { ...data.config, [key]: value },
      });
    },
    [selectedNode, onUpdateNode],
  );

  if (!selectedNode) {
    return (
      <div className="w-64 border-l bg-card/50 p-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center">
          Select a node to edit its properties
        </p>
      </div>
    );
  }

  const data = selectedNode.data as unknown as WorkflowNodeData;
  const nodeType = data.nodeType as NodeType;
  const category = getCategory(nodeType);
  const style = CATEGORY_STYLES[category];
  const Icon = NODE_ICONS[nodeType];

  return (
    <div className="w-64 border-l bg-card/50 overflow-y-auto">
      {/* Header */}
      <div className={`px-4 py-3 border-b ${style?.bg ?? ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon className={`h-4 w-4 ${style?.icon ?? ""}`} />}
            <span className="text-sm font-semibold">{NODE_LABELS[nodeType] ?? nodeType}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDeleteNode(selectedNode.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Properties */}
      <div className="p-4 space-y-4">
        {/* Common: label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={data.label ?? ""}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="h-8 text-sm"
            placeholder={NODE_LABELS[nodeType]}
          />
        </div>

        {/* Type-specific configs */}
        {nodeType === "wait" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Wait Days</Label>
              <Input
                type="number"
                min={0}
                value={(data.config?.days as number) ?? 1}
                onChange={(e) => handleConfigChange("days", parseInt(e.target.value) || 0)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Wait Hours</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={(data.config?.hours as number) ?? 0}
                onChange={(e) => handleConfigChange("hours", parseInt(e.target.value) || 0)}
                className="h-8 text-sm"
              />
            </div>
          </>
        )}

        {nodeType === "email_send" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Template ID</Label>
              <Input
                value={(data.config?.template_id as string) ?? ""}
                onChange={(e) => handleConfigChange("template_id", e.target.value)}
                className="h-8 text-sm"
                placeholder="Template UUID (optional)"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Subject</Label>
                <VariablePicker
                  workflowId={workflowId}
                  onInsert={(v) => handleConfigChange("subject", ((data.config?.subject as string) ?? "") + v)}
                />
              </div>
              <Input
                value={(data.config?.subject as string) ?? ""}
                onChange={(e) => handleConfigChange("subject", e.target.value)}
                className="h-8 text-sm"
                placeholder="Hi {{first_name}}, ..."
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Body</Label>
                <VariablePicker
                  workflowId={workflowId}
                  onInsert={(v) => handleConfigChange("body_template", ((data.config?.body_template as string) ?? "") + v)}
                />
              </div>
              <Textarea
                value={(data.config?.body_template as string) ?? ""}
                onChange={(e) => handleConfigChange("body_template", e.target.value)}
                className="text-sm font-mono"
                rows={5}
                placeholder="Email body with {{variables}}..."
              />
            </div>
          </>
        )}

        {(nodeType === "linkedin_connect" || nodeType === "linkedin_message") && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                {nodeType === "linkedin_connect" ? "Invitation Note" : "Message Body"}
              </Label>
              <VariablePicker
                workflowId={workflowId}
                onInsert={(v) => handleConfigChange("message", ((data.config?.message as string) ?? "") + v)}
              />
            </div>
            <Textarea
              value={(data.config?.message as string) ?? ""}
              onChange={(e) => handleConfigChange("message", e.target.value)}
              className="text-sm"
              rows={3}
              placeholder={nodeType === "linkedin_connect" ? "Optional invite note" : "Message text with {{variables}}"}
            />
          </div>
        )}

        {nodeType === "if" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Condition</Label>
            <select
              value={(data.config?.condition as string) ?? "email_replied"}
              onChange={(e) => handleConfigChange("condition", e.target.value)}
              className="w-full h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="email_replied">Email Replied</option>
              <option value="email_opened">Email Opened</option>
              <option value="email_clicked">Email Clicked</option>
              <option value="linkedin_accepted">LinkedIn Accepted</option>
              <option value="linkedin_replied">LinkedIn Replied</option>
              <option value="has_linkedin_url">Has LinkedIn URL</option>
            </select>
          </div>
        )}

        {nodeType === "trigger_cron" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Cron Expression</Label>
            <Input
              value={(data.config?.cron_expression as string) ?? "0 9 * * 1-5"}
              onChange={(e) => handleConfigChange("cron_expression", e.target.value)}
              className="h-8 text-sm font-mono"
              placeholder="0 9 * * 1-5"
            />
            <p className="text-[10px] text-muted-foreground">5-field cron: min hour dom mon dow</p>
          </div>
        )}

        {nodeType === "http_request" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">URL</Label>
              <Input
                value={(data.config?.url as string) ?? ""}
                onChange={(e) => handleConfigChange("url", e.target.value)}
                className="h-8 text-sm"
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <select
                value={(data.config?.method as string) ?? "GET"}
                onChange={(e) => handleConfigChange("method", e.target.value)}
                className="w-full h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
          </>
        )}

        {nodeType === "add_note" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Note Body</Label>
            <Textarea
              value={(data.config?.body as string) ?? ""}
              onChange={(e) => handleConfigChange("body", e.target.value)}
              className="text-sm"
              rows={3}
              placeholder="Note text..."
            />
          </div>
        )}

        {nodeType.startsWith("ai_") && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">AI Prompt</Label>
              <Textarea
                value={(data.config?.prompt as string) ?? ""}
                onChange={(e) => handleConfigChange("prompt", e.target.value)}
                className="text-sm"
                rows={4}
                placeholder="Instructions for the AI..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Input
                value={(data.config?.model as string) ?? ""}
                onChange={(e) => handleConfigChange("model", e.target.value)}
                className="h-8 text-sm"
                placeholder="Default model"
              />
            </div>
          </>
        )}

        {nodeType === "data_campaign" && (
          <DataCampaignSelector
            value={(data.config?.campaign_id as string) ?? ""}
            onChange={(id, name) => {
              if (!selectedNode) return;
              onUpdateNode(selectedNode.id, {
                config: { ...data.config, campaign_id: id, campaign_name: name },
                label: name || "Campaign Data",
              });
            }}
          />
        )}

        {nodeType === "data_lead_list" && (
          <DataLeadListSelector
            value={(data.config?.list_id as string) ?? ""}
            onChange={(id, name) => {
              if (!selectedNode) return;
              onUpdateNode(selectedNode.id, {
                config: { ...data.config, list_id: id, list_name: name },
                label: name || "Lead List Data",
              });
            }}
          />
        )}

        {/* Node ID (read only) */}
        <div className="pt-2 border-t space-y-1.5">
          <Label className="text-xs text-muted-foreground">Node ID</Label>
          <code className="block text-[10px] text-muted-foreground font-mono bg-muted rounded px-2 py-1 break-all">
            {selectedNode.id}
          </code>
        </div>
      </div>
    </div>
  );
}


// ─── Variable picker ─────────────────────────────────────

const LEAD_VARS = [
  "first_name", "last_name", "email", "company", "title",
  "phone", "linkedin_url", "website", "city", "state", "country", "industry",
];

interface VariablePickerProps {
  workflowId?: string;
  onInsert: (variable: string) => void;
}

function VariablePicker({ workflowId, onInsert }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [schema, setSchema] = useState<ContextSchemaResponse | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !workflowId) return;
    api
      .get<ContextSchemaResponse>(`/api/workflows/${workflowId}/context-schema`)
      .then(setSchema)
      .catch(() => {});
  }, [open, workflowId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allVars = schema?.lead_fields ?? LEAD_VARS;
  const workflowVars = schema?.variables ?? [];

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <Braces className="h-3 w-3" />
        Insert
      </Button>
      {open && (
        <div className="absolute right-0 top-6 z-50 w-48 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">Lead</p>
          {allVars.map((v) => (
            <button
              key={v}
              className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition-colors font-mono"
              onClick={() => {
                onInsert(`{{${v}}}`);
                setOpen(false);
              }}
            >
              {`{{${v}}}`}
            </button>
          ))}
          {workflowVars.length > 0 && (
            <>
              <div className="border-t my-1" />
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">Variables</p>
              {workflowVars.map((v) => (
                <button
                  key={v}
                  className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition-colors font-mono"
                  onClick={() => {
                    onInsert(`{{${v}}}`);
                    setOpen(false);
                  }}
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Data source selector components ──────────────────────

interface DataSelectorProps {
  value: string;
  onChange: (id: string, name: string) => void;
}

function DataCampaignSelector({ value, onChange }: DataSelectorProps) {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ campaigns: { id: string; name: string }[]; lead_lists: unknown[] }>("/api/workflows/data-sources")
      .then((data) => {
        if (!cancelled) setCampaigns(data.campaigns);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Campaign</Label>
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          const name = campaigns.find((c) => c.id === id)?.name ?? "";
          onChange(id, name);
        }}
        className="w-full h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Select a campaign...</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

function DataLeadListSelector({ value, onChange }: DataSelectorProps) {
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ campaigns: unknown[]; lead_lists: { id: string; name: string }[] }>("/api/workflows/data-sources")
      .then((data) => {
        if (!cancelled) setLists(data.lead_lists);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Lead List</Label>
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          const name = lists.find((ll) => ll.id === id)?.name ?? "";
          onChange(id, name);
        }}
        className="w-full h-8 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Select a lead list...</option>
        {lists.map((ll) => (
          <option key={ll.id} value={ll.id}>{ll.name}</option>
        ))}
      </select>
    </div>
  );
}
