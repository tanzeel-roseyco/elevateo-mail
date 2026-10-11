"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Clock,
  GitBranch,
  Trash2,
  GripVertical,
  Save,
  Loader2,
  ChevronUp,
  ChevronDown,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  WorkflowDefinition,
  WorkflowNode as WFNode,
  WorkflowConnection as WFConnection,
  NodeType,
  EdgeCondition,
} from "@/lib/types";

// ─── Step types available in simple mode ────────────────────
type SimpleStepType = "email_send" | "wait" | "if";

interface SimpleStep {
  id: string;
  type: SimpleStepType;
  label: string;
  config: Record<string, unknown>;
}

const STEP_TYPE_OPTIONS: { value: SimpleStepType; label: string; icon: typeof Mail; description: string }[] = [
  { value: "email_send", label: "Send Email", icon: Mail, description: "Send an email to the lead" },
  { value: "wait", label: "Wait", icon: Clock, description: "Wait for a specified number of days" },
  { value: "if", label: "Condition", icon: GitBranch, description: "Branch based on lead behavior" },
];

const CONDITION_OPTIONS = [
  { value: "email_replied", label: "Email Replied" },
  { value: "email_opened", label: "Email Opened" },
  { value: "email_clicked", label: "Email Clicked" },
  { value: "linkedin_accepted", label: "LinkedIn Accepted" },
  { value: "linkedin_replied", label: "LinkedIn Replied" },
  { value: "has_linkedin_url", label: "Has LinkedIn URL" },
];

let stepIdCounter = 0;
function nextStepId(): string {
  return `simple_${Date.now()}_${++stepIdCounter}`;
}

// ─── Convert workflow definition to simple steps ──────────
function workflowToSimpleSteps(def: WorkflowDefinition | null): SimpleStep[] {
  if (!def || def.nodes.length === 0) return [];

  // Build adjacency from connections (follow "always" + "yes" edges in order)
  const outEdges: Record<string, WFConnection[]> = {};
  for (const conn of def.connections) {
    if (!outEdges[conn.from]) outEdges[conn.from] = [];
    outEdges[conn.from].push(conn);
  }

  // Find trigger node (or first node)
  const triggerNode = def.nodes.find((n) => n.type.startsWith("trigger_"));
  if (!triggerNode) return def.nodes.map(nodeToStep);

  // Walk the "always" path linearly
  const visited = new Set<string>();
  const steps: SimpleStep[] = [];
  let currentId: string | null = triggerNode.id;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = def.nodes.find((n) => n.id === currentId);
    if (!node) break;

    // Skip trigger and end nodes from the step list display
    if (!node.type.startsWith("trigger_") && node.type !== "end") {
      steps.push(nodeToStep(node));
    }

    // Follow the first "always" edge or the "yes" edge for if nodes
    const nodeEdges: WFConnection[] = outEdges[currentId] ?? [];
    const alwaysEdge: WFConnection | undefined = nodeEdges.find((e: WFConnection) => e.condition === "always");
    const yesEdge: WFConnection | undefined = nodeEdges.find((e: WFConnection) => e.condition === "yes");
    const nextEdge: WFConnection | undefined = alwaysEdge ?? yesEdge ?? nodeEdges[0];
    currentId = nextEdge?.to ?? null;
  }

  return steps;
}

function nodeToStep(node: WFNode): SimpleStep {
  const type = (["email_send", "wait", "if"].includes(node.type) ? node.type : "email_send") as SimpleStepType;
  return {
    id: node.id,
    type,
    label: node.name,
    config: node.config ?? {},
  };
}

// ─── Convert simple steps back to workflow definition ──────
function simpleStepsToWorkflow(
  steps: SimpleStep[],
  existingDef: WorkflowDefinition | null,
): WorkflowDefinition {
  const base = existingDef ?? {
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

  const nodes: WFNode[] = [];
  const connections: WFConnection[] = [];

  // Add trigger node
  const triggerId = "trigger_start";
  nodes.push({
    id: triggerId,
    type: "trigger_manual",
    name: "Start",
    position: { x: 300, y: 50 },
    config: {},
  });

  // Add step nodes in sequence
  let prevId = triggerId;
  let yOffset = 150;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nodeId = step.id;

    nodes.push({
      id: nodeId,
      type: step.type as NodeType,
      name: step.label,
      position: { x: 300, y: yOffset },
      config: step.config,
    });

    // Connect previous node to this one
    const condition: EdgeCondition = "always";
    connections.push({
      from: prevId,
      to: nodeId,
      condition,
      order: i,
    });

    prevId = nodeId;
    yOffset += 120;
  }

  // Add end node
  const endId = "end_node";
  nodes.push({
    id: endId,
    type: "end",
    name: "End",
    position: { x: 300, y: yOffset },
    config: {},
  });

  connections.push({
    from: prevId,
    to: endId,
    condition: "always",
    order: steps.length,
  });

  return {
    ...base,
    workflow_version: (base.workflow_version ?? 0) + 1,
    nodes,
    connections,
  };
}

// ─── Props ──────────────────────────────────────────────────
interface SimpleModeProps {
  campaignId?: string;
  workflowId?: string;
  initialWorkflow: WorkflowDefinition | null;
  onSwitchToAdvanced: () => void;
}

// ─── Component ──────────────────────────────────────────────
export function SimpleMode({
  campaignId,
  workflowId,
  initialWorkflow,
  onSwitchToAdvanced,
}: SimpleModeProps) {
  const apiBase = workflowId
    ? `/api/workflows/${workflowId}`
    : `/api/campaigns/${campaignId}/workflow`;

  const [steps, setSteps] = useState<SimpleStep[]>(() =>
    workflowToSimpleSteps(initialWorkflow),
  );
  const [saving, setSaving] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Add a new step
  const addStep = useCallback((type: SimpleStepType) => {
    const id = nextStepId();
    const defaultConfigs: Record<SimpleStepType, Record<string, unknown>> = {
      email_send: { template_id: "", subject: "" },
      wait: { days: 1, hours: 0 },
      if: { condition: "email_replied" },
    };
    const labels: Record<SimpleStepType, string> = {
      email_send: "Send Email",
      wait: "Wait",
      if: "Condition",
    };
    const newStep: SimpleStep = {
      id,
      type,
      label: labels[type],
      config: defaultConfigs[type],
    };
    setSteps((prev) => [...prev, newStep]);
    setExpandedStep(id);
  }, []);

  // Remove a step
  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setExpandedStep(null);
  }, []);

  // Move a step up or down
  const moveStep = useCallback((id: string, direction: "up" | "down") => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }, []);

  // Update a step's config
  const updateStepConfig = useCallback(
    (id: string, key: string, value: unknown) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s,
        ),
      );
    },
    [],
  );

  // Update step label
  const updateStepLabel = useCallback((id: string, label: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, label } : s)),
    );
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const def = simpleStepsToWorkflow(steps, initialWorkflow);
      await api.put(apiBase, def);
      toast.success("Workflow saved");
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }, [steps, initialWorkflow, apiBase]);

  // Step icon lookup
  const stepIcon = useMemo(
    () => ({
      email_send: Mail,
      wait: Clock,
      if: GitBranch,
    }),
    [],
  );

  const stepColors: Record<SimpleStepType, { bg: string; border: string; icon: string }> = {
    email_send: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600" },
    wait: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600" },
    if: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600" },
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-card/50">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs">
            Simple Mode
          </Badge>
          <span className="text-xs text-muted-foreground">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onSwitchToAdvanced}
          >
            Switch to Advanced
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-8 text-xs"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto py-6 px-4 space-y-1">
          {/* Start indicator */}
          <div className="flex items-center justify-center mb-2">
            <Badge variant="outline" className="text-xs px-3 py-1">
              Trigger: Manual Start
            </Badge>
          </div>

          {steps.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-medium">No steps yet</p>
              <p className="text-xs mt-1">
                Add your first step below to build a workflow
              </p>
            </div>
          )}

          {steps.map((step, index) => {
            const Icon = stepIcon[step.type];
            const colors = stepColors[step.type];
            const isExpanded = expandedStep === step.id;

            return (
              <div key={step.id}>
                {/* Connector arrow */}
                {index === 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}

                <Card
                  className={`border-2 transition-all ${colors.border} ${
                    isExpanded ? "shadow-md" : ""
                  }`}
                >
                  {/* Step header — always visible */}
                  <button
                    type="button"
                    className="w-full"
                    onClick={() =>
                      setExpandedStep(isExpanded ? null : step.id)
                    }
                  >
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div
                          className={`rounded-md p-1.5 ${colors.bg}`}
                        >
                          <Icon className={`h-4 w-4 ${colors.icon}`} />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium">
                            {step.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {step.type === "email_send" &&
                              (step.config.subject
                                ? `Subject: ${step.config.subject}`
                                : "Configure email")}
                            {step.type === "wait" &&
                              `Wait ${step.config.days ?? 1} day${
                                (step.config.days as number) !== 1 ? "s" : ""
                              }${
                                (step.config.hours as number) > 0
                                  ? ` ${step.config.hours}h`
                                  : ""
                              }`}
                            {step.type === "if" &&
                              `Check: ${
                                CONDITION_OPTIONS.find(
                                  (c) => c.value === step.config.condition,
                                )?.label ?? step.config.condition
                              }`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            Step {index + 1}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </button>

                  {/* Step details — expanded */}
                  {isExpanded && (
                    <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
                      {/* Label */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={step.label}
                          onChange={(e) =>
                            updateStepLabel(step.id, e.target.value)
                          }
                          className="h-8 text-sm"
                        />
                      </div>

                      {/* Type-specific config */}
                      {step.type === "email_send" && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Subject</Label>
                            <Input
                              value={
                                (step.config.subject as string) ?? ""
                              }
                              onChange={(e) =>
                                updateStepConfig(
                                  step.id,
                                  "subject",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-sm"
                              placeholder="Email subject line"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">
                              Template ID (optional)
                            </Label>
                            <Input
                              value={
                                (step.config.template_id as string) ?? ""
                              }
                              onChange={(e) =>
                                updateStepConfig(
                                  step.id,
                                  "template_id",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-sm"
                              placeholder="Template UUID"
                            />
                          </div>
                        </>
                      )}

                      {step.type === "wait" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Days</Label>
                            <Input
                              type="number"
                              min={0}
                              value={(step.config.days as number) ?? 1}
                              onChange={(e) =>
                                updateStepConfig(
                                  step.id,
                                  "days",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Hours</Label>
                            <Input
                              type="number"
                              min={0}
                              max={23}
                              value={(step.config.hours as number) ?? 0}
                              onChange={(e) =>
                                updateStepConfig(
                                  step.id,
                                  "hours",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {step.type === "if" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Condition</Label>
                          <Select
                            value={
                              (step.config.condition as string) ??
                              "email_replied"
                            }
                            onValueChange={(v) =>
                              updateStepConfig(step.id, "condition", v)
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CONDITION_OPTIONS.map((opt) => (
                                <SelectItem
                                  key={opt.value}
                                  value={opt.value}
                                >
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveStep(step.id, "up")}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveStep(step.id, "down")}
                            disabled={index === steps.length - 1}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => removeStep(step.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Connector arrow after each step */}
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </div>
            );
          })}

          {/* End indicator */}
          <div className="flex items-center justify-center mt-2">
            <Badge variant="outline" className="text-xs px-3 py-1">
              End
            </Badge>
          </div>

          {/* Add step buttons */}
          <div className="pt-6">
            <p className="text-xs font-medium text-muted-foreground mb-2 text-center">
              Add a step
            </p>
            <div className="flex items-center justify-center gap-2">
              {STEP_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Button
                    key={opt.value}
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs gap-1.5"
                    onClick={() => addStep(opt.value)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
