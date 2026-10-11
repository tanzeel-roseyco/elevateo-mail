"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Loader2,
  Pause,
  Play,
  SkipForward,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  Activity,
  BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  WorkflowLeadStateEntry,
  WorkflowLeadSummary,
} from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────

interface NodeStats {
  node_id: string;
  total_executions: number;
  successes: number;
  errors: number;
  skipped: number;
  avg_duration_ms: number;
  error_rate: number;
  skip_rate: number;
}

interface NodeAnalyticsResponse {
  nodes: Record<string, NodeStats>;
}

interface DropoffEntry {
  node_id: string;
  total_leads: number;
  failed: number;
  stuck: number;
  failed_rate: number;
  stuck_rate: number;
}

interface DropoffResponse {
  dropoffs: DropoffEntry[];
}

interface DLQEntry {
  id: string;
  workflow_id: string;
  lead_id: string;
  lead_state_id: string;
  failed_node_id: string;
  failure_count: number;
  last_error: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

interface LeadActionResponse {
  ok: boolean;
  state_id: string;
  status: string;
}

interface DLQActionResponse {
  ok: boolean;
  state_id?: string;
  dlq_id?: string;
  status: string;
}

// ─── Status badge config ────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-blue-100", text: "text-blue-700" },
  running: { bg: "bg-amber-100", text: "text-amber-700" },
  waiting: { bg: "bg-purple-100", text: "text-purple-700" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
  failed: { bg: "bg-red-100", text: "text-red-700" },
  paused: { bg: "bg-gray-100", text: "text-gray-700" },
  dead_lettered: { bg: "bg-red-100", text: "text-red-700" },
  pending_review: { bg: "bg-orange-100", text: "text-orange-700" },
  retried: { bg: "bg-blue-100", text: "text-blue-700" },
  discarded: { bg: "bg-gray-100", text: "text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <Badge className={`text-[10px] ${colors.bg} ${colors.text} hover:${colors.bg}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── Props ──────────────────────────────────────────────────
interface RunMonitorProps {
  workflowId: string;
  /** Optional map of node_id -> display name for richer labels. */
  nodeNames?: Record<string, string>;
}

// ─── Component ──────────────────────────────────────────────
export function RunMonitor({ workflowId, nodeNames }: RunMonitorProps) {
  const [nodeStats, setNodeStats] = useState<NodeAnalyticsResponse | null>(null);
  const [dropoffs, setDropoffs] = useState<DropoffResponse | null>(null);
  const [dlqEntries, setDLQEntries] = useState<DLQEntry[]>([]);
  const [liveLeads, setLiveLeads] = useState<WorkflowLeadStateEntry[]>([]);
  const [leadSummary, setLeadSummary] = useState<WorkflowLeadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"leads" | "overview" | "nodes" | "dlq">("leads");

  // Resolve node display name
  const nodeName = useCallback(
    (nodeId: string) => nodeNames?.[nodeId] ?? nodeId,
    [nodeNames],
  );

  // Fetch all data
  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [nodesRes, dropoffRes, dlqRes, leadsRes, summaryRes] = await Promise.all([
          api
            .get<NodeAnalyticsResponse>(
              `/api/workflows/${workflowId}/analytics/nodes`,
            )
            .catch(() => null),
          api
            .get<DropoffResponse>(
              `/api/workflows/${workflowId}/analytics/dropoff`,
            )
            .catch(() => null),
          api
            .get<DLQEntry[]>(
              `/api/workflows/${workflowId}/dead-letter`,
            )
            .catch(() => []),
          api
            .get<WorkflowLeadStateEntry[]>(
              `/api/workflows/${workflowId}/leads`,
            )
            .catch(() => []),
          api
            .get<WorkflowLeadSummary>(
              `/api/workflows/${workflowId}/leads/summary`,
            )
            .catch(() => null),
        ]);
        setNodeStats(nodesRes);
        setDropoffs(dropoffRes);
        setDLQEntries(dlqRes ?? []);
        setLiveLeads(leadsRes ?? []);
        setLeadSummary(summaryRes);
      } catch {
        toast.error("Failed to load workflow run data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ─── Lead actions ──────────────────────────────────────────
  async function handleLeadAction(
    stateId: string,
    action: "skip" | "pause" | "resume",
  ) {
    setActionLoading((prev) => ({ ...prev, [stateId]: true }));
    try {
      await api.post<LeadActionResponse>(
        `/api/workflows/${workflowId}/leads/${stateId}/${action}`,
      );
      toast.success(`Lead ${action}${action === "skip" ? "ped" : action === "pause" ? "d" : "d"}`);
      await fetchData(true);
    } catch {
      toast.error(`Failed to ${action} lead`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [stateId]: false }));
    }
  }

  // ─── DLQ actions ───────────────────────────────────────────
  async function handleDLQAction(
    dlqId: string,
    action: "retry" | "discard",
  ) {
    setActionLoading((prev) => ({ ...prev, [dlqId]: true }));
    try {
      await api.post<DLQActionResponse>(
        `/api/workflows/${workflowId}/dead-letter/${dlqId}/${action}`,
      );
      toast.success(
        action === "retry"
          ? "Entry re-queued for retry"
          : "Entry discarded",
      );
      await fetchData(true);
    } catch {
      toast.error(`Failed to ${action} DLQ entry`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [dlqId]: false }));
    }
  }

  // ─── Derived stats ─────────────────────────────────────────
  const summaryStats = useMemo(() => {
    if (!nodeStats?.nodes) return null;
    const nodes = Object.values(nodeStats.nodes);
    const totalExec = nodes.reduce((a, n) => a + n.total_executions, 0);
    const totalSuccess = nodes.reduce((a, n) => a + n.successes, 0);
    const totalErrors = nodes.reduce((a, n) => a + n.errors, 0);
    const totalSkipped = nodes.reduce((a, n) => a + n.skipped, 0);
    return { totalExec, totalSuccess, totalErrors, totalSkipped, nodeCount: nodes.length };
  }, [nodeStats]);

  const leadDistribution = useMemo(() => {
    if (!dropoffs?.dropoffs) return [];
    return dropoffs.dropoffs.filter((d) => d.total_leads > 0);
  }, [dropoffs]);

  const totalLeads = useMemo(
    () => leadDistribution.reduce((a, d) => a + d.total_leads, 0),
    [leadDistribution],
  );

  const pendingDLQ = useMemo(
    () => dlqEntries.filter((e) => e.status === "pending_review"),
    [dlqEntries],
  );

  // ─── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Workflow Run Monitor</h2>
            <p className="text-xs text-muted-foreground">
              Live lead states, node performance, and failed/DLQ entries
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Leads
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{leadSummary?.total ?? totalLeads}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {leadSummary
                  ? `${leadSummary.completed} completed, ${leadSummary.running} active`
                  : `across ${leadDistribution.length} node${leadDistribution.length !== 1 ? "s" : ""}`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Executions
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summaryStats?.totalExec ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summaryStats?.totalSuccess ?? 0} successful
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Errors
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summaryStats?.totalErrors ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summaryStats && summaryStats.totalExec > 0
                  ? `${(
                      (summaryStats.totalErrors / summaryStats.totalExec) *
                      100
                    ).toFixed(1)}% error rate`
                  : "No executions yet"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Dead Letter Queue
              </CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {pendingDLQ.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                pending review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b">
          {(
            [
              { key: "leads", label: `Live Leads (${leadSummary?.total ?? liveLeads.length})`, icon: Users },
              { key: "overview", label: "Lead Distribution", icon: BarChart3 },
              { key: "nodes", label: "Node Performance", icon: Activity },
              { key: "dlq", label: `Dead Letter (${pendingDLQ.length})`, icon: AlertTriangle },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Live Leads Tab: Per-lead states ────────────── */}
        {activeTab === "leads" && (
          <Card>
            <CardContent className="p-0">
              {liveLeads.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No leads enrolled yet</p>
                  <p className="text-xs mt-1">
                    Use the Run button to enroll leads into this workflow.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Current Node</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Steps</TableHead>
                      <TableHead>Next Run</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveLeads.map((lead) => (
                      <TableRow
                        key={lead.id}
                        className={lead.status === "failed" ? "bg-red-50/50" : ""}
                      >
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{lead.lead_name}</p>
                            <p className="text-xs text-muted-foreground">{lead.lead_email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lead.current_node_id
                            ? nodeName(lead.current_node_id)
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={lead.status} />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {lead.execution_count}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lead.next_run_at
                            ? new Date(lead.next_run_at).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {(lead.status === "pending" || lead.status === "waiting" || lead.status === "running") && (
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleLeadAction(lead.id, "pause")}
                                    disabled={actionLoading[lead.id] ?? false}
                                  >
                                    {actionLoading[lead.id] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Pause className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Pause</p></TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleLeadAction(lead.id, "skip")}
                                    disabled={actionLoading[lead.id] ?? false}
                                  >
                                    <SkipForward className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Skip to next</p></TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                          {lead.status === "paused" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleLeadAction(lead.id, "resume")}
                                  disabled={actionLoading[lead.id] ?? false}
                                >
                                  {actionLoading[lead.id] ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Resume</p></TooltipContent>
                            </Tooltip>
                          )}
                          {lead.status === "failed" && lead.last_error && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-red-500 cursor-help">
                                  <AlertTriangle className="h-3.5 w-3.5 inline" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                <p className="text-xs">{lead.last_error}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Overview Tab: Lead distribution per node ─────── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {leadDistribution.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No leads in workflow yet</p>
                  <p className="text-xs mt-1">
                    Lead states will appear here once the workflow starts processing.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {leadDistribution
                  .sort((a, b) => b.total_leads - a.total_leads)
                  .map((entry) => {
                    const percentage =
                      totalLeads > 0
                        ? Math.round((entry.total_leads / totalLeads) * 100)
                        : 0;
                    const hasFailed = entry.failed > 0;
                    const hasStuck = entry.stuck > 0;

                    return (
                      <Card
                        key={entry.node_id}
                        className={
                          hasFailed
                            ? "border-red-200"
                            : hasStuck
                            ? "border-amber-200"
                            : ""
                        }
                      >
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {nodeName(entry.node_id)}
                              </span>
                              {hasFailed && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px]"
                                >
                                  {entry.failed} failed
                                </Badge>
                              )}
                              {hasStuck && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-amber-100 text-amber-700"
                                >
                                  {entry.stuck} stuck
                                </Badge>
                              )}
                            </div>
                            <span className="text-sm font-bold">
                              {entry.total_leads} lead
                              {entry.total_leads !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-muted-foreground">
                              {percentage}% of total
                            </span>
                            {(entry.failed_rate > 0 || entry.stuck_rate > 0) && (
                              <span className="text-[10px] text-muted-foreground">
                                {entry.failed_rate > 0 &&
                                  `${(entry.failed_rate * 100).toFixed(1)}% fail`}
                                {entry.failed_rate > 0 &&
                                  entry.stuck_rate > 0 &&
                                  " / "}
                                {entry.stuck_rate > 0 &&
                                  `${(entry.stuck_rate * 100).toFixed(1)}% stuck`}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ─── Nodes Tab: Per-node execution stats ─────────── */}
        {activeTab === "nodes" && (
          <Card>
            <CardContent className="p-0">
              {!nodeStats || Object.keys(nodeStats.nodes).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No execution data yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Node</TableHead>
                      <TableHead className="text-right">Executions</TableHead>
                      <TableHead className="text-right">Success</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Skipped</TableHead>
                      <TableHead className="text-right">Avg Duration</TableHead>
                      <TableHead className="text-right">Error Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.values(nodeStats.nodes)
                      .sort((a, b) => b.total_executions - a.total_executions)
                      .map((node) => (
                        <TableRow
                          key={node.node_id}
                          className={
                            node.error_rate > 0.1
                              ? "bg-red-50/50"
                              : ""
                          }
                        >
                          <TableCell className="font-medium text-sm">
                            {nodeName(node.node_id)}
                          </TableCell>
                          <TableCell className="text-right">
                            {node.total_executions}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600">
                            {node.successes}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {node.errors}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {node.skipped}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {node.avg_duration_ms > 0
                              ? `${node.avg_duration_ms.toFixed(0)}ms`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                node.error_rate > 0.1
                                  ? "text-red-600 font-medium"
                                  : node.error_rate > 0
                                  ? "text-amber-600"
                                  : "text-muted-foreground"
                              }
                            >
                              {(node.error_rate * 100).toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── DLQ Tab: Dead letter queue ──────────────────── */}
        {activeTab === "dlq" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dead Letter Queue</CardTitle>
              <CardDescription>
                Leads that failed repeatedly and were moved to the dead letter queue.
                Review each entry to retry or discard.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {dlqEntries.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-400" />
                  <p className="text-sm">No dead letter entries</p>
                  <p className="text-xs mt-1">
                    All leads are processing normally.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead ID</TableHead>
                      <TableHead>Failed Node</TableHead>
                      <TableHead className="text-right">Failures</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dlqEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">
                          {entry.lead_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="text-sm">
                          {nodeName(entry.failed_node_id)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {entry.failure_count}
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground max-w-[200px] truncate block cursor-help">
                                {entry.last_error || "Unknown error"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p className="text-xs">{entry.last_error}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={entry.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.status === "pending_review" && (
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() =>
                                      handleDLQAction(entry.id, "retry")
                                    }
                                    disabled={
                                      actionLoading[entry.id] ?? false
                                    }
                                  >
                                    {actionLoading[entry.id] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Retry this lead</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() =>
                                      handleDLQAction(entry.id, "discard")
                                    }
                                    disabled={
                                      actionLoading[entry.id] ?? false
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Discard this entry</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
