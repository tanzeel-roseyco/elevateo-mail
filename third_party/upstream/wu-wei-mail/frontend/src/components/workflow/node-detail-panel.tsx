"use client";

import { useCallback, useState, useEffect } from "react";
import type { Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { NODE_LABELS, NODE_ICONS, getCategory, CATEGORY_STYLES } from "./workflow-node";
import type { WorkflowNodeData } from "./workflow-node";
import { VariableMapper } from "./variable-mapper";
import type {
  NodeType,
  InputMapping,
  OutputDeclaration,
  ExecutionLogEntry,
  WorkflowNode as WFNode,
} from "@/lib/types";
import { api } from "@/lib/api";

// ─── Props ──────────────────────────────────────────────────
interface NodeDetailPanelProps {
  selectedNode: Node | null;
  workflowId?: string;
  allNodes?: WFNode[];
  onUpdateNode: (id: string, data: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (id: string) => void;
}

// ─── Main Component ─────────────────────────────────────────
export function NodeDetailPanel({
  selectedNode,
  workflowId,
  allNodes = [],
  onUpdateNode,
  onDeleteNode,
}: NodeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState("config");

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
      <div className="w-72 border-l bg-card/50 p-4 flex items-center justify-center">
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
    <div className="w-72 border-l bg-card/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b ${style?.bg ?? ""} flex-shrink-0`}>
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
        {data.description && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">{data.description}</p>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent flex-shrink-0 overflow-x-auto">
          {["config", "inputs", "outputs", "last-run", "diff", "logs"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="text-[10px] px-2 py-1.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none capitalize"
            >
              {tab === "last-run" ? "Last Run" : tab === "diff" ? "I/O Diff" : tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          {/* Tab 1: Config */}
          <TabsContent value="config" className="m-0 p-4 space-y-4">
            <ConfigTab
              data={data}
              nodeType={nodeType}
              selectedNodeId={selectedNode.id}
              onLabelChange={handleLabelChange}
              onConfigChange={handleConfigChange}
              onUpdateNode={onUpdateNode}
            />
          </TabsContent>

          {/* Tab 2: Inputs */}
          <TabsContent value="inputs" className="m-0 p-3 h-full">
            <InputsTab
              nodeId={selectedNode.id}
              mappings={(data as Record<string, unknown>)._inputMappings as InputMapping[] ?? []}
              upstreamNodes={allNodes.filter((n) => n.id !== selectedNode.id)}
              onUpdateNode={onUpdateNode}
            />
          </TabsContent>

          {/* Tab 3: Output Contract */}
          <TabsContent value="outputs" className="m-0 p-4">
            <OutputContractTab
              nodeType={nodeType}
              outputSchema={(data as Record<string, unknown>)._outputSchema as OutputDeclaration[] ?? []}
            />
          </TabsContent>

          {/* Tab 4: Last Run */}
          <TabsContent value="last-run" className="m-0 p-4">
            <LastRunTab workflowId={workflowId} nodeId={selectedNode.id} />
          </TabsContent>

          {/* Tab 5: I/O Diff */}
          <TabsContent value="diff" className="m-0 p-4">
            <DiffTab workflowId={workflowId} nodeId={selectedNode.id} />
          </TabsContent>

          {/* Tab 6: Logs */}
          <TabsContent value="logs" className="m-0 p-4">
            <LogsTab workflowId={workflowId} nodeId={selectedNode.id} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Node ID footer */}
      <div className="px-4 py-2 border-t flex-shrink-0">
        <code className="text-[9px] text-muted-foreground font-mono break-all">
          {selectedNode.id}
        </code>
      </div>
    </div>
  );
}

// ─── Tab 1: Config ──────────────────────────────────────────
function ConfigTab({
  data,
  nodeType,
  selectedNodeId,
  onLabelChange,
  onConfigChange,
  onUpdateNode,
}: {
  data: WorkflowNodeData;
  nodeType: NodeType;
  selectedNodeId: string;
  onLabelChange: (v: string) => void;
  onConfigChange: (k: string, v: unknown) => void;
  onUpdateNode: (id: string, data: Partial<WorkflowNodeData>) => void;
}) {
  return (
    <>
      {/* Identity */}
      <div className="space-y-1.5">
        <Label className="text-xs">Label</Label>
        <Input
          value={data.label ?? ""}
          onChange={(e) => onLabelChange(e.target.value)}
          className="h-8 text-sm"
          placeholder={NODE_LABELS[nodeType]}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <Input
          value={data.description ?? ""}
          onChange={(e) => onUpdateNode(selectedNodeId, { description: e.target.value })}
          className="h-8 text-sm"
          placeholder="Optional description"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Enabled</Label>
        <Switch
          checked={data.enabled !== false}
          onCheckedChange={(checked) => onUpdateNode(selectedNodeId, { enabled: checked })}
        />
      </div>

      {/* Type-specific config */}
      {nodeType === "wait" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Wait Days</Label>
            <Input
              type="number"
              min={0}
              value={(data.config?.days as number) ?? 0}
              onChange={(e) => onConfigChange("days", parseInt(e.target.value) || 0)}
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
              onChange={(e) => onConfigChange("hours", parseInt(e.target.value) || 0)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Wait Minutes</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={(data.config?.minutes as number) ?? 0}
              onChange={(e) => onConfigChange("minutes", parseInt(e.target.value) || 0)}
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
              onChange={(e) => onConfigChange("template_id", e.target.value)}
              className="h-8 text-sm"
              placeholder="Template UUID"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Thread Mode</Label>
            <select
              value={(data.config?.thread_mode as string) ?? "new"}
              onChange={(e) => onConfigChange("thread_mode", e.target.value)}
              className="w-full h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="new">New Thread</option>
              <option value="reply">Reply</option>
              <option value="forward">Forward</option>
            </select>
          </div>
        </>
      )}

      {(nodeType === "linkedin_connect" || nodeType === "linkedin_message") && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {nodeType === "linkedin_connect" ? "Invitation Note" : "Message Body"}
          </Label>
          <Textarea
            value={(data.config?.message_template as string) ?? ""}
            onChange={(e) => onConfigChange("message_template", e.target.value)}
            className="text-sm"
            rows={3}
            placeholder={nodeType === "linkedin_connect" ? "Optional invite note" : "Message text"}
          />
        </div>
      )}

      {nodeType === "if" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Condition</Label>
            <select
              value={(data.config?.condition as string) ?? "email_replied"}
              onChange={(e) => onConfigChange("condition", e.target.value)}
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
          <div className="flex items-center justify-between">
            <Label className="text-xs">Negate</Label>
            <Switch
              checked={(data.config?.negate as boolean) ?? false}
              onCheckedChange={(checked) => onConfigChange("negate", checked)}
            />
          </div>
        </>
      )}

      {nodeType === "trigger_cron" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Cron Expression</Label>
          <Input
            value={(data.config?.cron_expression as string) ?? "0 9 * * 1-5"}
            onChange={(e) => onConfigChange("cron_expression", e.target.value)}
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
              onChange={(e) => onConfigChange("url", e.target.value)}
              className="h-8 text-sm"
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Method</Label>
            <select
              value={(data.config?.method as string) ?? "POST"}
              onChange={(e) => onConfigChange("method", e.target.value)}
              className="w-full h-8 rounded-md border bg-background px-2 text-sm"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Auth Mode</Label>
            <select
              value={(data.config?.auth_mode as string) ?? "none"}
              onChange={(e) => onConfigChange("auth_mode", e.target.value)}
              className="w-full h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="none">None</option>
              <option value="bearer_token">Bearer Token</option>
              <option value="basic">Basic Auth</option>
              <option value="api_key_header">API Key Header</option>
            </select>
          </div>
        </>
      )}

      {nodeType.startsWith("ai_") && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt Template</Label>
            <Textarea
              value={(data.config?.prompt_template as string) ?? ""}
              onChange={(e) => onConfigChange("prompt_template", e.target.value)}
              className="text-sm"
              rows={4}
              placeholder="Instructions for the AI..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Model Reference</Label>
            <Input
              value={(data.config?.model_ref as string) ?? ""}
              onChange={(e) => onConfigChange("model_ref", e.target.value)}
              className="h-8 text-sm"
              placeholder="Default model"
            />
          </div>
        </>
      )}

      {nodeType === "add_note" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Note Text</Label>
          <Textarea
            value={(data.config?.note_text as string) ?? ""}
            onChange={(e) => onConfigChange("note_text", e.target.value)}
            className="text-sm"
            rows={3}
            placeholder="Note text..."
          />
        </div>
      )}
    </>
  );
}

// ─── Tab 2: Inputs ──────────────────────────────────────────
function InputsTab({
  nodeId,
  mappings,
  upstreamNodes,
  onUpdateNode,
}: {
  nodeId: string;
  mappings: InputMapping[];
  upstreamNodes: WFNode[];
  onUpdateNode: (id: string, data: Partial<WorkflowNodeData>) => void;
}) {
  const handleChange = useCallback(
    (newMappings: InputMapping[]) => {
      onUpdateNode(nodeId, { _inputMappings: newMappings } as Partial<WorkflowNodeData>);
    },
    [nodeId, onUpdateNode],
  );

  return (
    <div className="h-64">
      <VariableMapper
        mappings={mappings}
        upstreamNodes={upstreamNodes}
        onChange={handleChange}
      />
    </div>
  );
}

// ─── Tab 3: Output Contract ─────────────────────────────────
function OutputContractTab({
  outputSchema,
}: {
  nodeType: NodeType;
  outputSchema: OutputDeclaration[];
}) {
  const displaySchema = outputSchema.length > 0 ? outputSchema : [];

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        Declared outputs for this node. Downstream nodes can reference these via input mappings.
      </p>
      {displaySchema.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No output schema declared. Default outputs will be used based on node type.
        </p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Key</th>
                <th className="text-left px-2 py-1.5 font-medium">Type</th>
                <th className="text-left px-2 py-1.5 font-medium">v</th>
              </tr>
            </thead>
            <tbody>
              {displaySchema.map((o, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1 font-mono text-[10px]">{o.key}</td>
                  <td className="px-2 py-1 text-muted-foreground">{o.type}</td>
                  <td className="px-2 py-1 text-muted-foreground">{o.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Last Run Data ───────────────────────────────────
function LastRunTab({ workflowId, nodeId }: { workflowId?: string; nodeId: string }) {
  const [log, setLog] = useState<ExecutionLogEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLastRun = useCallback(async (wfId: string, nId: string) => {
    setLoading(true);
    try {
      const data = await api.get<ExecutionLogEntry>(`/api/workflows/${wfId}/nodes/${nId}/last-run`);
      setLog(data);
    } catch {
      setLog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    fetchLastRun(workflowId, nodeId);
  }, [workflowId, nodeId, fetchLastRun]);

  if (!workflowId) {
    return <p className="text-xs text-muted-foreground">Save workflow first to see execution data.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!log) {
    return <p className="text-xs text-muted-foreground text-center py-4">No execution data yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            log.status === "success"
              ? "bg-emerald-100 text-emerald-700"
              : log.status === "error"
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {log.status}
        </span>
        {log.duration_ms != null && <span className="text-muted-foreground">{log.duration_ms}ms</span>}
        <span className="text-muted-foreground ml-auto">{log.started_at}</span>
      </div>

      {log.error_message && (
        <div className="bg-red-50 border border-red-200 rounded p-2">
          <p className="text-[10px] text-red-700 font-mono">{log.error_message}</p>
        </div>
      )}

      <CollapsibleJson label="Input Snapshot" data={log.input_snapshot} />
      <CollapsibleJson label="Output Snapshot" data={log.output_snapshot} />
    </div>
  );
}

// ─── Tab 5: I/O Diff ────────────────────────────────────────
function DiffTab({ workflowId }: { workflowId?: string; nodeId: string }) {
  if (!workflowId) {
    return <p className="text-xs text-muted-foreground">Save workflow first to see diff data.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground text-center py-4">
      I/O diff shows expected vs actual outputs. Run the workflow to populate.
    </p>
  );
}

// ─── Tab 6: Logs ────────────────────────────────────────────
function LogsTab({ workflowId, nodeId }: { workflowId?: string; nodeId: string }) {
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (wfId: string, nId: string) => {
    setLoading(true);
    try {
      const data = await api.get<ExecutionLogEntry[]>(`/api/workflows/${wfId}/nodes/${nId}/logs?limit=20`);
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    fetchLogs(workflowId, nodeId);
  }, [workflowId, nodeId, fetchLogs]);

  if (!workflowId) {
    return <p className="text-xs text-muted-foreground">Save workflow first to see logs.</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">No execution logs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="border rounded p-2 space-y-1">
          <div className="flex items-center gap-2 text-[10px]">
            <span
              className={`px-1.5 py-0.5 rounded font-medium ${
                log.status === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : log.status === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {log.status}
            </span>
            {log.duration_ms != null && <span className="text-muted-foreground">{log.duration_ms}ms</span>}
            <span className="text-muted-foreground ml-auto">{log.started_at}</span>
          </div>
          {log.error_message && (
            <p className="text-[9px] text-red-600 font-mono truncate">{log.error_message}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Helper: Collapsible JSON viewer ────────────────────────
function CollapsibleJson({ label, data }: { label: string; data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const hasData = data && Object.keys(data).length > 0;

  return (
    <div className="border rounded">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-medium hover:bg-muted/50"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {hasData ? `${Object.keys(data).length} keys` : "empty"}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {open && (
        <pre className="px-2 py-1.5 border-t text-[9px] font-mono bg-muted/30 max-h-40 overflow-auto whitespace-pre-wrap">
          {hasData ? JSON.stringify(data, null, 2) : "{}"}
        </pre>
      )}
    </div>
  );
}
