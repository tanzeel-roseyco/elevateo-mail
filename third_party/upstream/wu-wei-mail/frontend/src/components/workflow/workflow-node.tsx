"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeType } from "@/lib/types";
import {
  Mail, Linkedin, Clock, Play, Square, GitBranch, ArrowRightLeft,
  Webhook, Globe, Bot, Brain, Tag, ListChecks, ShieldCheck,
  StickyNote, Users, CalendarClock, Zap, Merge, Database, Reply,
} from "lucide-react";

// ─── Node category → style mapping ────────────────────────
const CATEGORY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  trigger:       { bg: "bg-emerald-50",  border: "border-emerald-300", icon: "text-emerald-600" },
  outreach:      { bg: "bg-blue-50",     border: "border-blue-300",    icon: "text-blue-600" },
  logic:         { bg: "bg-amber-50",    border: "border-amber-300",   icon: "text-amber-600" },
  integration:   { bg: "bg-purple-50",   border: "border-purple-300",  icon: "text-purple-600" },
  ai:            { bg: "bg-pink-50",     border: "border-pink-300",    icon: "text-pink-600" },
  collaboration: { bg: "bg-teal-50",     border: "border-teal-300",    icon: "text-teal-600" },
  data:          { bg: "bg-indigo-50",   border: "border-indigo-300",  icon: "text-indigo-600" },
  control:       { bg: "bg-gray-50",     border: "border-gray-300",    icon: "text-gray-600" },
};

function getCategory(type: NodeType): string {
  if (type.startsWith("trigger_")) return "trigger";
  if (["email_send", "linkedin_connect", "linkedin_message", "auto_respond"].includes(type)) return "outreach";
  if (["if", "switch", "merge"].includes(type)) return "logic";
  if (["http_request", "outgoing_webhook"].includes(type)) return "integration";
  if (type.startsWith("ai_")) return "ai";
  if (["add_note", "create_task", "approval_gate"].includes(type)) return "collaboration";
  if (type.startsWith("data_")) return "data";
  return "control"; // wait, end
}

// ─── Node type → icon ──────────────────────────────────────
const NODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  trigger_manual: Play,
  trigger_new_lead: Users,
  trigger_list_membership_added: ListChecks,
  trigger_inbound_webhook: Webhook,
  trigger_cron: CalendarClock,
  email_send: Mail,
  linkedin_connect: Linkedin,
  linkedin_message: Linkedin,
  auto_respond: Reply,
  wait: Clock,
  end: Square,
  if: GitBranch,
  switch: ArrowRightLeft,
  merge: Merge,
  http_request: Globe,
  outgoing_webhook: Zap,
  ai_generate_message: Bot,
  ai_classify_reply: Brain,
  ai_extract_fields: Tag,
  ai_decision: Brain,
  add_note: StickyNote,
  create_task: ListChecks,
  approval_gate: ShieldCheck,
  data_campaign: Database,
  data_lead_list: Users,
};

const NODE_LABELS: Record<string, string> = {
  trigger_manual: "Manual Trigger",
  trigger_new_lead: "New Lead",
  trigger_list_membership_added: "List Added",
  trigger_inbound_webhook: "Webhook Trigger",
  trigger_cron: "Scheduled",
  email_send: "Send Email",
  linkedin_connect: "LinkedIn Connect",
  linkedin_message: "LinkedIn Message",
  auto_respond: "Auto-Respond",
  wait: "Wait",
  end: "End",
  if: "If / Else",
  switch: "Switch",
  merge: "Merge",
  http_request: "HTTP Request",
  outgoing_webhook: "Webhook Out",
  ai_generate_message: "AI Generate",
  ai_classify_reply: "AI Classify",
  ai_extract_fields: "AI Extract",
  ai_decision: "AI Decision",
  add_note: "Add Note",
  create_task: "Create Task",
  approval_gate: "Approval Gate",
  data_campaign: "Campaign Data",
  data_lead_list: "Lead List Data",
};

// ─── Node output descriptions ──────────────────────────────
const NODE_OUTPUTS: Record<string, string> = {
  trigger_manual: "Triggered leads",
  trigger_new_lead: "New lead",
  trigger_list_membership_added: "Added lead",
  trigger_inbound_webhook: "Webhook payload",
  trigger_cron: "Scheduled batch",
  email_send: "Email sent",
  linkedin_connect: "Request sent",
  linkedin_message: "Message sent",
  auto_respond: "Response / Escalation",
  wait: "After delay",
  if: "Yes / No",
  switch: "Matched branch",
  merge: "Merged leads",
  http_request: "Response data",
  outgoing_webhook: "Webhook sent",
  ai_generate_message: "Generated text",
  ai_classify_reply: "Classification",
  ai_extract_fields: "Extracted fields",
  ai_decision: "AI decision",
  add_note: "Note added",
  create_task: "Task created",
  approval_gate: "Approved / Rejected",
  data_campaign: "Campaign leads",
  data_lead_list: "List members",
};

export interface WorkflowNodeData {
  nodeType: NodeType;
  label: string;
  config: Record<string, unknown>;
  // V2 fields
  description?: string;
  enabled?: boolean;
  outputSchemaCount?: number;
  inputMappingCount?: number;
  [key: string]: unknown;
}

function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const nodeType = nodeData.nodeType as NodeType;
  const category = getCategory(nodeType);
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.control;
  const Icon = NODE_ICONS[nodeType] ?? Play;
  const label = nodeData.label || NODE_LABELS[nodeType] || nodeType;
  const isTrigger = nodeType.startsWith("trigger_");
  const isEnd = nodeType === "end";
  const isData = nodeType.startsWith("data_");
  const isDisabled = nodeData.enabled === false;
  const description = nodeData.description || "";
  const outputCount = nodeData.outputSchemaCount ?? 0;
  const hasInputMappings = (nodeData.inputMappingCount ?? 0) > 0;
  // Data nodes show the entity name from config
  const dataEntityName = isData
    ? (nodeData.config?.campaign_name as string) || (nodeData.config?.list_name as string) || ""
    : "";

  return (
    <div
      className={`
        rounded-lg border-2 px-3 py-2 min-w-[160px] shadow-sm transition-shadow
        ${style.bg} ${style.border}
        ${selected ? "ring-2 ring-primary ring-offset-1 shadow-md" : ""}
        ${isDisabled ? "opacity-50 border-dashed" : ""}
      `}
    >
      {/* Input handle (not on triggers) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}

      <div className="flex items-center gap-2">
        <div className={`rounded-md p-1.5 ${style.bg}`}>
          <Icon className={`h-4 w-4 ${style.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
            {isData && dataEntityName ? dataEntityName : label}
            {isDisabled && <span className="text-[9px] text-muted-foreground">(off)</span>}
          </div>
          {description ? (
            <div className="text-[10px] text-muted-foreground truncate">{description}</div>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              {isData ? NODE_LABELS[nodeType] : (NODE_LABELS[nodeType] !== label ? NODE_LABELS[nodeType] : category)}
            </div>
          )}
        </div>
      </div>

      {/* Output indicator + V2 badges */}
      {!isEnd && (NODE_OUTPUTS[nodeType] || outputCount > 0 || hasInputMappings) && (
        <div className="mt-1.5 pt-1.5 border-t border-dashed border-gray-200">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            {NODE_OUTPUTS[nodeType] && (
              <>
                <span className="font-medium">Output:</span>
                <span>{NODE_OUTPUTS[nodeType]}</span>
              </>
            )}
            {outputCount > 0 && (
              <span className="ml-auto bg-gray-200 text-gray-600 rounded px-1 text-[9px]">
                {outputCount} out
              </span>
            )}
            {hasInputMappings && (
              <span className="bg-blue-100 text-blue-600 rounded px-1 text-[9px]">
                mapped
              </span>
            )}
          </div>
        </div>
      )}

      {/* Output handle (not on end) */}
      {!isEnd && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}

      {/* Conditional handles for if/switch */}
      {nodeType === "if" && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white"
            style={{ left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
            style={{ left: "70%" }}
          />
        </>
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);

export { NODE_LABELS, NODE_ICONS, NODE_OUTPUTS, CATEGORY_STYLES, getCategory };
