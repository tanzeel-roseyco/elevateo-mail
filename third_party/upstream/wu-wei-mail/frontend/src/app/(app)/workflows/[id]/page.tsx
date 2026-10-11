"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Layout, ListChecks, Activity, Play, Loader2, Globe, FileEdit } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { WorkflowDefinitionResponse } from "@/lib/types";
import { WorkflowBuilder } from "@/components/workflow/workflow-builder";
import { SimpleMode } from "@/components/workflow/simple-mode";
import { RunMonitor } from "@/components/workflow/run-monitor";
import { EnrollLeadsDialog } from "@/components/workflow/enroll-leads-dialog";

type BuilderMode = "simple" | "advanced" | "monitor";

export default function WorkflowBuilderPage() {
  const params = useParams();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowDefinitionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<BuilderMode>("advanced");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const isPublished = workflow?.status === "published";

  async function handleTogglePublish() {
    setPublishing(true);
    try {
      const action = isPublished ? "unpublish" : "publish";
      const wf = await api.post<WorkflowDefinitionResponse>(
        `/api/workflows/${workflowId}/${action}`,
      );
      setWorkflow(wf);
      toast.success(isPublished ? "Workflow unpublished" : "Workflow published");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Operation failed";
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  }

  // Build a map of node_id -> display name for the run monitor
  const nodeNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (workflow?.canonical_json?.nodes) {
      for (const node of workflow.canonical_json.nodes) {
        map[node.id] = node.name;
      }
    }
    return map;
  }, [workflow]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wf = await api.get<WorkflowDefinitionResponse>(
        `/api/workflows/${workflowId}`,
      );
      setWorkflow(wf);
    } catch {
      toast.error("Failed to load workflow");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

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
            <Link href="/workflows">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">
                {workflow?.name ?? "Workflow Builder"}
              </h1>
              <Badge
                variant={isPublished ? "default" : "secondary"}
                className={`text-[10px] ${isPublished ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}`}
              >
                {workflow?.status ?? "draft"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Version {workflow?.workflow_version ?? 1}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          <Button
            variant={isPublished ? "outline" : "default"}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleTogglePublish}
            disabled={publishing}
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isPublished ? (
              <FileEdit className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            {isPublished ? "Unpublish" : "Publish"}
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setEnrollOpen(true)}
            disabled={!isPublished}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
        </div>
      </div>

      {/* Content */}
      {mode === "simple" && (
        <SimpleMode
          workflowId={workflowId}
          campaignId={workflow?.campaign_id ?? undefined}
          initialWorkflow={workflow?.canonical_json ?? null}
          onSwitchToAdvanced={() => setMode("advanced")}
        />
      )}

      {mode === "advanced" && (
        <WorkflowBuilder
          workflowId={workflowId}
          campaignId={workflow?.campaign_id ?? undefined}
          initialWorkflow={workflow?.canonical_json ?? null}
        />
      )}

      {mode === "monitor" && (
        <RunMonitor
          workflowId={workflowId}
          nodeNames={nodeNames}
        />
      )}

      <EnrollLeadsDialog
        workflowId={workflowId}
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onEnrolled={() => setMode("monitor")}
      />
    </div>
  );
}
