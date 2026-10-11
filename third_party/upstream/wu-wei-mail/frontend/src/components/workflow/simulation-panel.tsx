"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Play, Check, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { WorkflowDefinition } from "@/lib/types";

interface ScenarioAssumptions {
  email_replied: boolean;
  email_opened: boolean;
  email_clicked: boolean;
  linkedin_accepted: boolean;
  linkedin_replied: boolean;
  has_linkedin_url: boolean;
  http_success: boolean;
  ai_confidence_above_threshold: boolean;
}

interface SimulationStep {
  node_id: string;
  node_type: string;
  node_name: string;
  action: string;
  detail: string;
}

interface SimulationResult {
  steps: SimulationStep[];
  reached_end: boolean;
  error: string | null;
  total_nodes_visited: number;
  warnings: string[];
}

const SCENARIO_LABELS: Record<keyof ScenarioAssumptions, string> = {
  email_replied: "Lead replies to email",
  email_opened: "Lead opens email",
  email_clicked: "Lead clicks link",
  linkedin_accepted: "Lead accepts LinkedIn invite",
  linkedin_replied: "Lead replies on LinkedIn",
  has_linkedin_url: "Lead has LinkedIn URL",
  http_success: "HTTP calls succeed",
  ai_confidence_above_threshold: "AI confidence above threshold",
};

const DEFAULT_SCENARIO: ScenarioAssumptions = {
  email_replied: false,
  email_opened: true,
  email_clicked: false,
  linkedin_accepted: true,
  linkedin_replied: false,
  has_linkedin_url: true,
  http_success: true,
  ai_confidence_above_threshold: true,
};

const PRESETS: { name: string; scenario: ScenarioAssumptions }[] = [
  {
    name: "Optimistic",
    scenario: {
      email_replied: true, email_opened: true, email_clicked: true,
      linkedin_accepted: true, linkedin_replied: true, has_linkedin_url: true,
      http_success: true, ai_confidence_above_threshold: true,
    },
  },
  {
    name: "No Reply",
    scenario: {
      email_replied: false, email_opened: true, email_clicked: false,
      linkedin_accepted: true, linkedin_replied: false, has_linkedin_url: true,
      http_success: true, ai_confidence_above_threshold: true,
    },
  },
  {
    name: "Cold Lead",
    scenario: {
      email_replied: false, email_opened: false, email_clicked: false,
      linkedin_accepted: false, linkedin_replied: false, has_linkedin_url: true,
      http_success: true, ai_confidence_above_threshold: false,
    },
  },
  {
    name: "No LinkedIn",
    scenario: {
      email_replied: false, email_opened: true, email_clicked: false,
      linkedin_accepted: false, linkedin_replied: false, has_linkedin_url: false,
      http_success: true, ai_confidence_above_threshold: true,
    },
  },
];

interface SimulationPanelProps {
  campaignId: string;
  buildWorkflowDef: () => WorkflowDefinition;
  onHighlightPath?: (nodeIds: string[]) => void;
}

export function SimulationPanel({ campaignId, buildWorkflowDef, onHighlightPath }: SimulationPanelProps) {
  const [scenario, setScenario] = useState<ScenarioAssumptions>({ ...DEFAULT_SCENARIO });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);

  const runSimulation = useCallback(async () => {
    setRunning(true);
    try {
      const wfDef = buildWorkflowDef();
      const res = await api.post<SimulationResult>(
        `/api/campaigns/${campaignId}/workflow/simulate`,
        { workflow_json: wfDef, scenario },
      );
      setResult(res);

      // Highlight simulated path on canvas
      const nodeIds = res.steps.map((s) => s.node_id);
      onHighlightPath?.(nodeIds);

      if (res.error) {
        toast.error(`Simulation error: ${res.error}`);
      } else if (res.reached_end) {
        toast.success(`Simulation complete — ${res.total_nodes_visited} nodes visited`);
      } else {
        toast.info("Simulation did not reach an end node");
      }
    } catch {
      toast.error("Simulation failed");
    } finally {
      setRunning(false);
    }
  }, [campaignId, buildWorkflowDef, scenario, onHighlightPath]);

  const toggleScenario = useCallback((key: keyof ScenarioAssumptions) => {
    setScenario((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const applyPreset = useCallback((preset: ScenarioAssumptions) => {
    setScenario({ ...preset });
  }, []);

  const actionColor = (action: string) => {
    if (action === "end") return "bg-gray-100 text-gray-700";
    if (action === "wait") return "bg-amber-100 text-amber-700";
    if (action === "branch_yes") return "bg-emerald-100 text-emerald-700";
    if (action === "branch_no") return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Play className="h-3.5 w-3.5" />
          Simulate
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Workflow Simulation</SheetTitle>
          <SheetDescription>
            Preview how a lead would travel through this workflow under different scenarios.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Presets */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Presets</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.name}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyPreset(p.scenario)}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Scenario toggles */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground">Scenario Assumptions</Label>
            {(Object.keys(scenario) as Array<keyof ScenarioAssumptions>).map((key) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="text-xs">{SCENARIO_LABELS[key]}</Label>
                <Switch
                  checked={scenario[key]}
                  onCheckedChange={() => toggleScenario(key)}
                />
              </div>
            ))}
          </div>

          {/* Run button */}
          <Button onClick={runSimulation} disabled={running} className="w-full">
            {running ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Simulating...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Run Simulation</>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold text-muted-foreground">Result</Label>
                {result.reached_end ? (
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                    <Check className="h-3 w-3 mr-1" /> Reached End
                  </Badge>
                ) : result.error ? (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Error
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    No End Node
                  </Badge>
                )}
              </div>

              {result.error && (
                <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                  {result.error}
                </p>
              )}

              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Step list */}
              <div className="space-y-1.5">
                {result.steps.map((step, i) => (
                  <div
                    key={`${step.node_id}-${i}`}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="font-mono text-muted-foreground w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{step.node_name}</span>
                        <Badge className={`text-[10px] ${actionColor(step.action)}`}>
                          {step.action}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[10px]">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                {result.total_nodes_visited} node(s) visited
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
