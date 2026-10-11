"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  ArrowUpRight,
  Play,
  Pause,
  Trash2,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Clock,
  Mail,
  Users,
  Calendar,
  Settings,
  Trophy,
  FlaskConical,
  Workflow,
  Network,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  Campaign,
  CampaignStatus,
  CampaignStats,
  ABTestResult,
} from "@/lib/types";

// ─── Status badge config (matches campaigns list page) ──────
const statusConfig: Record<
  CampaignStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
  }
> = {
  draft: {
    label: "Draft",
    variant: "secondary",
    className: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  },
  active: {
    label: "Active",
    variant: "default",
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  paused: {
    label: "Paused",
    variant: "secondary",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  completed: {
    label: "Completed",
    variant: "secondary",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  },
  archived: {
    label: "Archived",
    variant: "secondary",
    className: "bg-gray-100 text-gray-500 hover:bg-gray-100",
  },
};

// ─── Helpers ─────────────────────────────────────────────────
function formatRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

function formatDays(days: Record<string, boolean> | undefined): string {
  if (!days) return "Mon-Fri";
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayKeys = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const active = dayKeys
    .filter((k) => days[k])
    .map((k) => dayNames[dayKeys.indexOf(k)]);
  return active.length > 0 ? active.join(", ") : "None";
}

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

function stepTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    email: "Email",
    follow_up: "Follow-up",
    manual_email: "Manual Email",
    linkedin: "LinkedIn",
    phone: "Phone Call",
    task: "Task",
  };
  return labels[type] ?? type;
}

// ─── Component ───────────────────────────────────────────────
export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [abResults, setAbResults] = useState<Record<string, ABTestResult>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get<Campaign>(`/api/campaigns/${campaignId}`),
      api
        .get<CampaignStats>(`/api/analytics/campaigns/${campaignId}`)
        .catch(() => null),
    ])
      .then(([c, s]) => {
        setCampaign(c);
        setStats(s);

        // Fetch A/B test results for each step
        const allSteps = c.sequences.flatMap((seq) => seq.steps);
        if (allSteps.length > 0) {
          Promise.all(
            allSteps.map((step) =>
              api
                .get<ABTestResult>(`/api/analytics/ab-test/${step.id}`)
                .then((result) => ({ stepId: step.id, result }))
                .catch(() => null)
            )
          ).then((results) => {
            const map: Record<string, ABTestResult> = {};
            for (const r of results) {
              if (r) map[r.stepId] = r.result;
            }
            setAbResults(map);
          });
        }
      })
      .catch(() => {
        toast.error("Failed to load campaign");
      })
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(action: "start" | "pause" | "resume" | "delete") {
    setActionLoading(true);
    try {
      if (action === "delete") {
        await api.delete(`/api/campaigns/${campaignId}`);
        toast.success("Campaign deleted");
        router.push("/campaigns");
        return;
      }
      await api.post(`/api/campaigns/${campaignId}/${action}`);
      toast.success(
        `Campaign ${action === "start" ? "launched" : action + "d"}`
      );
      load();
    } catch {
      toast.error(`Failed to ${action} campaign`);
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Upgrade to workflow ───────────────────────────────────
  async function handleUpgradeToWorkflow() {
    setUpgrading(true);
    try {
      await api.patch(`/api/campaigns/${campaignId}`, {
        execution_mode: "workflow",
      });
      toast.success("Campaign upgraded to workflow mode");
      router.push(`/campaigns/${campaignId}/workflow`);
    } catch {
      toast.error("Failed to upgrade campaign");
    } finally {
      setUpgrading(false);
    }
  }

  const isWorkflowMode = campaign?.execution_mode === "workflow";

  // ─── Loading skeleton ───────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        {/* Stat cards skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-12 mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Details skeleton */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Campaign not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/campaigns">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const sc = statusConfig[campaign.status] ?? statusConfig.draft;

  const statCards = stats
    ? [
        {
          title: "Sent",
          value: stats.total_sent.toLocaleString(),
          rate: null,
          icon: Send,
        },
        {
          title: "Opens",
          value: stats.total_opens.toLocaleString(),
          rate: formatRate(stats.open_rate),
          icon: Eye,
        },
        {
          title: "Clicks",
          value: stats.total_clicks.toLocaleString(),
          rate: formatRate(stats.click_rate),
          icon: MousePointerClick,
        },
        {
          title: "Replies",
          value: stats.total_replies.toLocaleString(),
          rate: formatRate(stats.reply_rate),
          icon: MessageSquare,
        },
        {
          title: "Bounces",
          value: stats.total_bounces.toLocaleString(),
          rate: formatRate(stats.bounce_rate),
          icon: AlertTriangle,
        },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button asChild variant="outline" size="icon" className="mt-0.5">
            <Link href="/campaigns">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {campaign.name}
              </h1>
              <Badge variant={sc.variant} className={sc.className}>
                {sc.label}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {campaign.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isWorkflowMode ? (
            <Button asChild>
              <Link href={`/campaigns/${campaignId}/workflow`}>
                <Workflow className="h-4 w-4 mr-2" />
                Open Workflow Builder
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline">
                <Link href={`/campaigns/${campaignId}/workflow`}>
                  <Workflow className="h-4 w-4 mr-2" />
                  Workflow
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={handleUpgradeToWorkflow}
                disabled={upgrading}
              >
                {upgrading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                )}
                Upgrade to Workflow
              </Button>
            </>
          )}
          {campaign.status === "draft" && (
            <Button
              onClick={() => handleAction("start")}
              disabled={actionLoading}
            >
              <Play className="h-4 w-4 mr-2" />
              Launch
            </Button>
          )}
          {campaign.status === "active" && (
            <Button
              variant="outline"
              onClick={() => handleAction("pause")}
              disabled={actionLoading}
            >
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          {campaign.status === "paused" && (
            <Button
              onClick={() => handleAction("resume")}
              disabled={actionLoading}
            >
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          )}
          <Button
            variant="destructive"
            size="icon"
            onClick={() => handleAction("delete")}
            disabled={actionLoading}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ─── Stat Cards ─────────────────────────────────────── */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.rate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.rate} rate
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Workflow mode banner ─────────────────────────────── */}
      {isWorkflowMode && (
        <Card className="border-2 border-blue-200 bg-blue-50/50">
          <CardContent className="py-4 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 bg-blue-100">
                  <Network className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Workflow Mode Active</p>
                  <p className="text-xs text-muted-foreground">
                    This campaign uses the workflow engine for execution. Manage
                    your automation flow in the Workflow Builder.
                  </p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={`/campaigns/${campaignId}/workflow`}>
                  <Workflow className="h-4 w-4 mr-2" />
                  Open Builder
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Main content area ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Sequences & Steps ──────────────────────────── */}
        <div className="lg:col-span-2">
          <Tabs defaultValue={isWorkflowMode ? "ab-tests" : "sequences"}>
            <TabsList>
              {!isWorkflowMode && (
                <TabsTrigger value="sequences">Sequences</TabsTrigger>
              )}
              <TabsTrigger value="ab-tests">A/B Tests</TabsTrigger>
            </TabsList>

            {/* ─── Sequences Tab (only in sequence mode) ─── */}
            {!isWorkflowMode && (
            <TabsContent value="sequences" className="mt-4 space-y-4">
              {campaign.sequences.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No sequences configured yet. Add a sequence to get started.
                  </CardContent>
                </Card>
              ) : (
                campaign.sequences
                  .sort((a, b) => a.order - b.order)
                  .map((sequence) => (
                    <Card key={sequence.id}>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {sequence.name}
                        </CardTitle>
                        <CardDescription>
                          {sequence.steps.length} step
                          {sequence.steps.length !== 1 ? "s" : ""}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {sequence.steps.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No steps in this sequence.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {sequence.steps
                              .sort((a, b) => a.order - b.order)
                              .map((step, stepIndex) => (
                                <div
                                  key={step.id}
                                  className="flex items-start gap-3 relative"
                                >
                                  {/* Step connector line */}
                                  {stepIndex <
                                    sequence.steps.length - 1 && (
                                    <div className="absolute left-[15px] top-[32px] bottom-[-12px] w-px bg-border" />
                                  )}

                                  {/* Step number circle */}
                                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium relative z-10">
                                    {step.order + 1}
                                  </div>

                                  {/* Step content */}
                                  <div className="flex-1 border rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {stepTypeLabel(step.step_type)}
                                        </Badge>
                                        {step.wait_days > 0 && (
                                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            {step.wait_days} day
                                            {step.wait_days !== 1 ? "s" : ""}{" "}
                                            wait
                                          </span>
                                        )}
                                      </div>
                                      {abResults[step.id] &&
                                        abResults[step.id].variants.length >
                                          1 && (
                                          <Badge
                                            variant="secondary"
                                            className="text-xs bg-violet-100 text-violet-700 hover:bg-violet-100"
                                          >
                                            <FlaskConical className="h-3 w-3 mr-1" />
                                            A/B Test
                                          </Badge>
                                        )}
                                    </div>
                                    {step.subject && (
                                      <p className="text-sm font-medium mt-2">
                                        {step.subject}
                                      </p>
                                    )}
                                    {step.body && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {step.body}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
              )}
            </TabsContent>
            )}

            {/* ─── A/B Tests Tab ──────────────────────────── */}
            <TabsContent value="ab-tests" className="mt-4 space-y-4">
              {Object.keys(abResults).length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No A/B test data available yet. Results will appear here
                    once emails are sent with variants.
                  </CardContent>
                </Card>
              ) : (
                Object.entries(abResults).map(([stepId, result]) => {
                  if (result.variants.length < 2) return null;

                  // Find step info
                  const step = campaign.sequences
                    .flatMap((s) => s.steps)
                    .find((s) => s.id === stepId);

                  return (
                    <Card key={stepId}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <FlaskConical className="h-4 w-4" />
                              Step {step ? step.order + 1 : "?"} -{" "}
                              {step
                                ? stepTypeLabel(step.step_type)
                                : "Unknown"}
                            </CardTitle>
                            <CardDescription>
                              {result.variants.length} variants tested
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {result.is_significant && result.winner && (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                <Trophy className="h-3 w-3 mr-1" />
                                Winner found
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              {(result.confidence * 100).toFixed(0)}%
                              confidence
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Variant</TableHead>
                              <TableHead className="text-right">
                                Sent
                              </TableHead>
                              <TableHead className="text-right">
                                Opens
                              </TableHead>
                              <TableHead className="text-right">
                                Clicks
                              </TableHead>
                              <TableHead className="text-right">
                                Replies
                              </TableHead>
                              <TableHead className="text-right">
                                Open Rate
                              </TableHead>
                              <TableHead className="text-right">
                                Click Rate
                              </TableHead>
                              <TableHead className="text-right">
                                Reply Rate
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result.variants.map((v) => (
                              <TableRow
                                key={v.variant_id}
                                className={
                                  v.variant_id === result.winner
                                    ? "bg-emerald-50/50"
                                    : ""
                                }
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {v.variant_name}
                                    {v.variant_id === result.winner && (
                                      <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {v.sent_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {v.open_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {v.click_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {v.reply_count.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatRate(v.open_rate)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatRate(v.click_rate)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatRate(v.reply_rate)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ─── Sidebar: Campaign Settings ─────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Campaign Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Send Days
                  </span>
                  <span className="font-medium text-right max-w-[150px]">
                    {formatDays(campaign.send_days)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    Send Window
                  </span>
                  <span className="font-medium">
                    {formatHour(campaign.send_start_hour)} -{" "}
                    {formatHour(campaign.send_end_hour)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Send className="h-3.5 w-3.5" />
                    Daily Limit
                  </span>
                  <Badge variant="secondary">{campaign.daily_limit}</Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    Timezone
                  </span>
                  <span className="font-medium text-xs">
                    {campaign.timezone}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Network className="h-3.5 w-3.5" />
                    Execution Mode
                  </span>
                  <Badge
                    variant="secondary"
                    className={
                      isWorkflowMode
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }
                  >
                    {isWorkflowMode ? "Workflow" : "Sequence"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Track Opens</span>
                <Badge
                  variant="secondary"
                  className={
                    campaign.track_opens
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }
                >
                  {campaign.track_opens ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Track Clicks</span>
                <Badge
                  variant="secondary"
                  className={
                    campaign.track_clicks
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }
                >
                  {campaign.track_clicks ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stop on Reply</span>
                <Badge
                  variant="secondary"
                  className={
                    campaign.stop_on_reply
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }
                >
                  {campaign.stop_on_reply ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Leads</span>
                  <Badge variant="secondary">
                    {stats.total_leads.toLocaleString()}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-xs font-medium">
                    {new Date(campaign.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="text-xs font-medium">
                    {new Date(campaign.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
