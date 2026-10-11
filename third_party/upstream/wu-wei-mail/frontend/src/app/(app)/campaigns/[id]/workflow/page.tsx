"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Layout, ListChecks, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { WorkflowDefinition, WorkflowDefinitionResponse } from "@/lib/types";
import { WorkflowBuilder } from "@/components/workflow/workflow-builder";
import { SimpleMode } from "@/components/workflow/simple-mode";
import { RunMonitor } from "@/components/workflow/run-monitor";

type BuilderMode = "simple" | "advanced" | "monitor";

export default function WorkflowPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mode, setMode] = useState<BuilderMode>("simple");

  // Build a map of node_id -> display name for the run monitor
  const nodeNames: Record<string, string> = {};
  if (workflow?.nodes) {
    for (const node of workflow.nodes) {
      nodeNames[node.id] = node.name;
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Try to fetch workflow definition + response metadata
      const wfRes = await api.get<WorkflowDefinitionResponse>(
        `/api/campaigns/${campaignId}/workflow`,
      );
      setWorkflow(wfRes.canonical_json ?? null);
      setWorkflowId(wfRes.id);
    } catch (err) {
      // 404 = no workflow yet, start blank
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 404
      ) {
        setWorkflow(null);
        setNotFound(true);
      } else {
        // Fallback: try the raw canonical_json shape (older API compat)
        try {
          const wf = await api.get<WorkflowDefinition>(
            `/api/campaigns/${campaignId}/workflow`,
          );
          setWorkflow(wf);
        } catch {
          toast.error("Failed to load workflow");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-7 w-48" />
        </div>
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" className="h-8 w-8">
            <Link href={`/campaigns/${campaignId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Workflow Builder</h1>
            <p className="text-xs text-muted-foreground">
              {notFound && !workflow
                ? "No workflow yet — add nodes to get started"
                : `Version ${workflow?.workflow_version ?? 1}`}
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as BuilderMode)}
        >
          <TabsList className="h-8">
            <TabsTrigger value="simple" className="text-xs gap-1.5 h-7">
              <ListChecks className="h-3.5 w-3.5" />
              Simple
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs gap-1.5 h-7">
              <Layout className="h-3.5 w-3.5" />
              Advanced
            </TabsTrigger>
            <TabsTrigger value="monitor" className="text-xs gap-1.5 h-7">
              <Activity className="h-3.5 w-3.5" />
              Monitor
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Builder content */}
      {mode === "simple" && (
        <SimpleMode
          campaignId={campaignId}
          workflowId={workflowId ?? undefined}
          initialWorkflow={workflow}
          onSwitchToAdvanced={() => setMode("advanced")}
        />
      )}

      {mode === "advanced" && (
        <WorkflowBuilder
          campaignId={campaignId}
          workflowId={workflowId ?? undefined}
          initialWorkflow={workflow}
        />
      )}

      {mode === "monitor" && workflowId && (
        <RunMonitor
          workflowId={workflowId}
          nodeNames={nodeNames}
        />
      )}

      {mode === "monitor" && !workflowId && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No workflow to monitor</p>
            <p className="text-xs mt-1">
              Create and save a workflow first to see run data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
