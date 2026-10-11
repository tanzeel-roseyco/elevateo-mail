"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Check, AlertTriangle, Code, Layout, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type {
  NodeType,
  WorkflowDefinition,
  WorkflowNode as WFNode,
  WorkflowConnection as WFConnection,
  WorkflowValidationResult,
  EdgeCondition,
} from "@/lib/types";
import { api } from "@/lib/api";
import { WorkflowNode, NODE_LABELS } from "./workflow-node";
import type { WorkflowNodeData } from "./workflow-node";
import { NodePalette } from "./node-palette";
import { PropertiesPanel } from "./properties-panel";
import { SimulationPanel } from "./simulation-panel";
import { AnalyticsOverlay } from "./analytics-overlay";
import { DeletableEdge } from "./deletable-edge";

// ─── Custom node/edge types for React Flow ─────────────────
const nodeTypes = { workflow: WorkflowNode };
const edgeTypes = { deletable: DeletableEdge };

// ─── Convert between our types and React Flow types ────────
function safeNodePosition(node: Partial<WFNode>, index: number): { x: number; y: number } {
  const rawPos = node.position as { x?: unknown; y?: unknown } | undefined;
  const x = typeof rawPos?.x === "number" && Number.isFinite(rawPos.x) ? rawPos.x : 120 + index * 220;
  const y = typeof rawPos?.y === "number" && Number.isFinite(rawPos.y) ? rawPos.y : 120;
  return { x, y };
}

function wfNodesToRFNodes(wfNodes: WFNode[]): Node[] {
  return wfNodes.map((n, i) => ({
    id: n.id,
    type: "workflow",
    position: safeNodePosition(n, i),
    data: {
      nodeType: n.type,
      label: n.name,
      config: n.config ?? {},
      // V2 fields (fallback to defaults for V1 compat)
      description: n.description ?? "",
      enabled: n.enabled ?? true,
      outputSchemaCount: n.output_schema?.length ?? 0,
      inputMappingCount: n.input_mapping?.length ?? 0,
    } satisfies WorkflowNodeData,
  }));
}

function wfConnectionsToRFEdges(connections: WFConnection[]): Edge[] {
  return connections.map((c, i) => ({
    id: `e-${c.from}-${c.to}-${i}`,
    type: "deletable",
    source: c.from,
    target: c.to,
    sourceHandle: c.condition === "yes" ? "yes" : c.condition === "no" ? "no" : undefined,
    label: c.condition !== "always" ? c.condition : undefined,
    animated: c.condition === "always",
    style: { strokeWidth: 2 },
  }));
}

function rfNodesToWFNodes(nodes: Node[]): WFNode[] {
  return nodes.map((n) => {
    const data = n.data as unknown as WorkflowNodeData;
    const x = typeof n.position?.x === "number" && Number.isFinite(n.position.x) ? n.position.x : 0;
    const y = typeof n.position?.y === "number" && Number.isFinite(n.position.y) ? n.position.y : 0;
    const node: WFNode = {
      id: n.id,
      type: data.nodeType as NodeType,
      name: data.label || NODE_LABELS[data.nodeType] || data.nodeType,
      position: { x: Math.round(x), y: Math.round(y) },
      config: data.config ?? {},
    };
    // Preserve V2 fields if present
    if (data.description) node.description = data.description;
    if (data.enabled === false) node.enabled = false;
    return node;
  });
}

function rfEdgesToWFConnections(edges: Edge[]): WFConnection[] {
  return edges.map((e, i) => {
    let condition: EdgeCondition = "always";
    if (e.sourceHandle === "yes") condition = "yes";
    else if (e.sourceHandle === "no") condition = "no";
    else if (e.label) condition = e.label as EdgeCondition;
    return {
      from: e.source,
      to: e.target,
      condition,
      order: i,
    };
  });
}

// ─── Main Builder ──────────────────────────────────────────
interface WorkflowBuilderProps {
  campaignId?: string;
  workflowId?: string;
  initialWorkflow: WorkflowDefinition | null;
}

let nodeIdCounter = 0;
function nextNodeId(): string {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

export function WorkflowBuilder({ campaignId, workflowId, initialWorkflow }: WorkflowBuilderProps) {
  // Determine API base path
  const apiBase = workflowId
    ? `/api/workflows/${workflowId}`
    : `/api/campaigns/${campaignId}/workflow`;

  const rfInstance = useRef<ReactFlowInstance | null>(null);

  const initialRFNodes = useMemo(
    () => (initialWorkflow ? wfNodesToRFNodes(initialWorkflow.nodes) : []),
    [initialWorkflow],
  );
  const initialRFEdges = useMemo(
    () => (initialWorkflow ? wfConnectionsToRFEdges(initialWorkflow.connections) : []),
    [initialWorkflow],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialRFNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialRFEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [mode, setMode] = useState<"canvas" | "json">("canvas");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  // Build current workflow definition from canvas state
  const buildWorkflowDef = useCallback((): WorkflowDefinition => {
    const base = initialWorkflow ?? {
      schema_version: 1,
      workflow_version: 1,
      meta: { name: "Untitled Workflow", description: "", tags: [] },
      settings: {
        timezone: "UTC",
        prevent_same_day_cross_channel_touch: true,
        max_node_executions_per_lead: 100,
      },
      variables: {},
      credentials_refs: {},
      canvas_notes: [],
      trigger_policies: { dedupe_window_minutes: 60, max_catch_up_runs: 10 },
    };
    return {
      ...base,
      workflow_version: (base.workflow_version ?? 0) + 1,
      nodes: rfNodesToWFNodes(nodes),
      connections: rfEdgesToWFConnections(edges),
    };
  }, [nodes, edges, initialWorkflow]);

  // ─── Edge connection ──────────────────────────────────────
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: "deletable", animated: true, style: { strokeWidth: 2 } }, eds));
    },
    [setEdges],
  );

  // ─── Node selection ───────────────────────────────────────
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelectedNode(node),
    [],
  );

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // ─── Add node (from palette click or drop) ─────────────
  const addNode = useCallback(
    (type: NodeType, configOrPosition?: Record<string, unknown> | { x: number; y: number }) => {
      const id = nextNodeId();
      // Determine if the second arg is a position or a config
      let pos: { x: number; y: number };
      let config: Record<string, unknown> = {};
      if (configOrPosition && "x" in configOrPosition && "y" in configOrPosition && Object.keys(configOrPosition).length === 2) {
        pos = configOrPosition as { x: number; y: number };
      } else if (configOrPosition) {
        config = configOrPosition as Record<string, unknown>;
        pos = {
          x: 250 + Math.random() * 200,
          y: 100 + nodes.length * 80,
        };
      } else {
        pos = {
          x: 250 + Math.random() * 200,
          y: 100 + nodes.length * 80,
        };
      }

      // Derive label — for data nodes, use the entity name
      let label = NODE_LABELS[type] ?? type;
      if (type === "data_campaign" && config.campaign_name) {
        label = config.campaign_name as string;
      } else if (type === "data_lead_list" && config.list_name) {
        label = config.list_name as string;
      }

      const newNode: Node = {
        id,
        type: "workflow",
        position: pos,
        data: {
          nodeType: type,
          label,
          config,
        } satisfies WorkflowNodeData,
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [nodes.length, setNodes],
  );

  // ─── Drop handler ─────────────────────────────────────────
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/workflow-node-type") as NodeType;
      if (!type || !rfInstance.current) return;

      const position = rfInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Check for data node config from drag data
      const configStr = event.dataTransfer.getData("application/workflow-node-config");
      if (configStr) {
        try {
          const config = JSON.parse(configStr) as Record<string, unknown>;
          // Create node at drop position with config
          const id = nextNodeId();
          let label = NODE_LABELS[type] ?? type;
          if (type === "data_campaign" && config.campaign_name) {
            label = config.campaign_name as string;
          } else if (type === "data_lead_list" && config.list_name) {
            label = config.list_name as string;
          }
          const newNode: Node = {
            id,
            type: "workflow",
            position,
            data: {
              nodeType: type,
              label,
              config,
            } satisfies WorkflowNodeData,
          };
          setNodes((nds) => [...nds, newNode]);
          return;
        } catch {
          // Fall through to standard addNode
        }
      }

      addNode(type, position);
    },
    [addNode, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // ─── Update node data ─────────────────────────────────────
  const updateNodeData = useCallback(
    (nodeId: string, updates: Partial<WorkflowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          return { ...n, data: { ...n.data, ...updates } };
        }),
      );
      // Also update selectedNode if it's the same
      setSelectedNode((prev) => {
        if (prev?.id === nodeId) {
          return { ...prev, data: { ...prev.data, ...updates } };
        }
        return prev;
      });
    },
    [setNodes],
  );

  // ─── Delete node ──────────────────────────────────────────
  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  // ─── Save ─────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const def = buildWorkflowDef();
      await api.put(apiBase, def);
      toast.success("Workflow saved");
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }, [buildWorkflowDef, apiBase]);

  // ─── Validate ─────────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      const def = buildWorkflowDef();
      // For standalone workflows, use the import validate endpoint
      const validateUrl = campaignId
        ? `/api/campaigns/${campaignId}/workflow/validate`
        : `/api/workflows/import/validate`;
      const result = await api.post<WorkflowValidationResult>(
        validateUrl,
        def,
      );
      setValidation(result);
      if (result.valid) {
        toast.success("Workflow is valid");
      } else {
        toast.error(`${result.errors.length} validation error(s)`);
      }
    } catch (err) {
      toast.error(`Validation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setValidating(false);
    }
  }, [buildWorkflowDef, campaignId]);

  // ─── Mode toggle ──────────────────────────────────────────
  const switchToJson = useCallback(() => {
    const def = buildWorkflowDef();
    setJsonText(JSON.stringify(def, null, 2));
    setMode("json");
  }, [buildWorkflowDef]);

  const switchToCanvas = useCallback(() => {
    try {
      const def = JSON.parse(jsonText) as WorkflowDefinition;
      setNodes(wfNodesToRFNodes(def.nodes));
      setEdges(wfConnectionsToRFEdges(def.connections));
      setMode("canvas");
    } catch {
      toast.error("Invalid JSON — fix errors before switching to canvas");
    }
  }, [jsonText, setNodes, setEdges]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* ─── Toolbar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-card/50">
        <div className="flex items-center gap-3">
          <Tabs value={mode} onValueChange={(v) => (v === "json" ? switchToJson() : switchToCanvas())}>
            <TabsList className="h-8">
              <TabsTrigger value="canvas" className="text-xs gap-1.5 h-7">
                <Layout className="h-3.5 w-3.5" />
                Canvas
              </TabsTrigger>
              <TabsTrigger value="json" className="text-xs gap-1.5 h-7">
                <Code className="h-3.5 w-3.5" />
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {validation && (
            <Badge
              variant={validation.valid ? "default" : "destructive"}
              className="text-xs"
            >
              {validation.valid ? (
                <><Check className="h-3 w-3 mr-1" /> Valid</>
              ) : (
                <><AlertTriangle className="h-3 w-3 mr-1" /> {validation.errors.length} error(s)</>
              )}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SimulationPanel
            campaignId={campaignId ?? workflowId ?? ""}
            buildWorkflowDef={buildWorkflowDef}
          />
          <AnalyticsOverlay
            campaignId={campaignId ?? ""}
            enabled={analyticsEnabled && !!campaignId}
            onToggle={campaignId ? setAnalyticsEnabled : () => {}}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={validating}
            className="h-8 text-xs"
          >
            {validating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
            Validate
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 text-xs"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* ─── Canvas / JSON area ───────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {mode === "canvas" ? (
          <>
            <NodePalette onAddNode={addNode} />
            <div className="flex-1 relative">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onInit={(inst) => { rfInstance.current = inst; }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: "deletable" }}
                fitView
                snapToGrid
                snapGrid={[16, 16]}
                deleteKeyCode={["Backspace", "Delete"]}
                className="bg-background"
              >
                <Controls className="!bg-card !border !shadow-sm" />
                <MiniMap
                  className="!bg-card !border !shadow-sm"
                  nodeColor="#94a3b8"
                  maskColor="rgb(0, 0, 0, 0.08)"
                />
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
              </ReactFlow>
            </div>
            <PropertiesPanel
              selectedNode={selectedNode}
              workflowId={workflowId}
              onUpdateNode={updateNodeData}
              onDeleteNode={deleteNode}
            />
          </>
        ) : (
          <div className="flex-1 p-4">
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full h-full font-mono text-xs bg-muted/50 border rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* ─── Validation errors ────────────────────────────── */}
      {validation && !validation.valid && (
        <div className="border-t bg-destructive/5 px-4 py-2 max-h-32 overflow-y-auto">
          <p className="text-xs font-semibold text-destructive mb-1">Validation Errors:</p>
          <ul className="space-y-0.5">
            {validation.errors.map((err, i) => (
              <li key={i} className="text-xs text-destructive/80">
                <span className="font-mono">{err.path}</span>: {err.message}
              </li>
            ))}
          </ul>
          {validation.warnings.length > 0 && (
            <>
              <p className="text-xs font-semibold text-amber-600 mt-2 mb-1">Warnings:</p>
              <ul className="space-y-0.5">
                {validation.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-600/80">{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
