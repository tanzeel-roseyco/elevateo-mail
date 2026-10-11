"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Mail,
  Send,
  Shield,
  Flame,
  CheckCircle,
  XCircle,
  Loader2,
  Activity,
  Settings,
  Clock,
  Play,
  Pause,
  AlertTriangle,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Account, DNSCheckResponse, WarmupAccountStatus, WarmupAction as WarmupActionType } from "@/lib/types";
import { accountStatus } from "@/lib/types";

// ─── Status badge config (matches accounts list page) ─────
const statusConfig: Record<
  "connected" | "warming" | "error" | "disconnected",
  { label: string; className: string }
> = {
  connected: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  warming: {
    label: "Warming Up",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-700 hover:bg-red-100",
  },
  disconnected: {
    label: "Paused",
    className: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  },
};

// ─── Provider config ──────────────────────────────────────
const providerLabels: Record<string, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
  manual: "Manual SMTP",
};

// ─── Helpers ──────────────────────────────────────────────
function healthColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function healthTextColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function healthLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 50) return "Fair";
  return "Poor";
}

const phaseColors: Record<string, string> = {
  enrolling: "bg-blue-100 text-blue-700",
  ramping: "bg-amber-100 text-amber-700",
  steady: "bg-emerald-100 text-emerald-700",
  graduating: "bg-teal-100 text-teal-700",
  graduated: "bg-emerald-100 text-emerald-800",
  paused: "bg-stone-100 text-stone-600",
  error: "bg-red-100 text-red-700",
};

const phaseLabels: Record<string, string> = {
  enrolling: "Enrolling",
  ramping: "Ramping Up",
  steady: "Steady State",
  graduating: "Graduating",
  graduated: "Graduated",
  paused: "Paused",
  error: "Error",
};

function gaugeColor(value: number): string {
  if (value >= 0.9) return "text-emerald-600";
  if (value >= 0.7) return "text-amber-600";
  return "text-red-600";
}

function formatActionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────
export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: accountId } = React.use(params);

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingDns, setVerifyingDns] = useState(false);

  // Warmup state
  const [warmupStatus, setWarmupStatus] = useState<WarmupAccountStatus | null>(null);
  const [warmupTimeline, setWarmupTimeline] = useState<WarmupActionType[]>([]);
  const [warmupLoading, setWarmupLoading] = useState(true);
  const [warmupActionLoading, setWarmupActionLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Account>(`/api/accounts/${accountId}`)
      .then((data) => setAccount(data))
      .catch(() => toast.error("Failed to load account"))
      .finally(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch warmup status + timeline
  useEffect(() => {
    let cancelled = false;
    async function loadWarmup() {
      try {
        const [ws, tl] = await Promise.all([
          api.get<WarmupAccountStatus>(`/api/warmup/accounts/${accountId}/status`),
          api.get<WarmupActionType[]>(`/api/warmup/accounts/${accountId}/timeline?limit=50`),
        ]);
        if (!cancelled) {
          setWarmupStatus(ws);
          setWarmupTimeline(tl);
        }
      } catch {
        // Not enrolled or warmup disabled — fine
      } finally {
        if (!cancelled) setWarmupLoading(false);
      }
    }
    loadWarmup();
    return () => { cancelled = true; };
  }, [accountId]);

  async function handleStartWarmup() {
    setWarmupActionLoading(true);
    try {
      const ws = await api.post<WarmupAccountStatus>(
        `/api/warmup/accounts/${accountId}/start`,
        { target_volume: 50 }
      );
      setWarmupStatus(ws);
      toast.success("Warmup started");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start warmup");
    } finally {
      setWarmupActionLoading(false);
    }
  }

  async function handlePauseWarmup() {
    setWarmupActionLoading(true);
    try {
      const ws = await api.post<WarmupAccountStatus>(
        `/api/warmup/accounts/${accountId}/pause`
      );
      setWarmupStatus(ws);
      toast.success("Warmup paused");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    } finally {
      setWarmupActionLoading(false);
    }
  }

  async function handleResumeWarmup() {
    setWarmupActionLoading(true);
    try {
      const ws = await api.post<WarmupAccountStatus>(
        `/api/warmup/accounts/${accountId}/resume`
      );
      setWarmupStatus(ws);
      toast.success("Warmup resumed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setWarmupActionLoading(false);
    }
  }

  async function handleVerifyDns() {
    if (!account) return;
    setVerifyingDns(true);
    try {
      const result = await api.post<DNSCheckResponse>(
        `/api/accounts/${accountId}/verify-dns`
      );

      setAccount((prev) =>
        prev
          ? {
              ...prev,
              spf_verified: !!result.spf?.valid,
              dkim_verified: !!result.dkim?.valid,
              dmarc_verified: !!result.dmarc?.valid,
            }
          : prev
      );

      if (result.overall_healthy) {
        toast.success(`DNS verification passed for ${result.email}`);
      } else {
        const failing: string[] = [];
        if (!result.spf?.valid) failing.push("SPF");
        if (!result.dkim?.valid) failing.push("DKIM");
        if (!result.dmarc?.valid) failing.push("DMARC");
        toast.warning(
          `DNS issues found: ${failing.join(", ")} not verified`
        );
      }
    } catch {
      toast.error("Failed to verify DNS records");
    } finally {
      setVerifyingDns(false);
    }
  }

  // ─── Loading skeleton ───────────────────────────────────
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

  // ─── Not found ──────────────────────────────────────────
  if (!account) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Account not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/accounts">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Accounts
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const status = accountStatus(account);
  const sc = statusConfig[status];
  const healthScore = Math.round(account.health_score * 100);
  const displayName = account.display_name || account.email;
  const providerLabel = providerLabels[account.provider] ?? account.provider;
  const allDnsPass =
    account.spf_verified && account.dkim_verified && account.dmarc_verified;

  // ─── Stat cards ─────────────────────────────────────────
  const statCards = [
    {
      title: "Health Score",
      value: `${healthScore}%`,
      sub: healthLabel(healthScore),
      icon: Activity,
      color: healthTextColor(healthScore),
    },
    {
      title: "Sent Today",
      value: `${account.sent_today}`,
      sub: `of ${account.daily_limit} daily limit`,
      icon: Send,
      color: "text-blue-600",
    },
    {
      title: "Warmup Level",
      value: `${account.warmup_level}`,
      sub: account.warmup_enabled ? "Warmup active" : "Warmup disabled",
      icon: Flame,
      color: "text-orange-600",
    },
    {
      title: "DNS Status",
      value: allDnsPass ? "Healthy" : "Issues",
      sub: `${[account.spf_verified, account.dkim_verified, account.dmarc_verified].filter(Boolean).length}/3 records verified`,
      icon: Shield,
      color: allDnsPass ? "text-emerald-600" : "text-red-600",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button asChild variant="outline" size="icon" className="mt-0.5">
            <Link href="/accounts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {displayName}
              </h1>
              <Badge variant="secondary" className={sc.className}>
                {sc.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {account.email}
              {account.email !== displayName && (
                <span className="mx-2 text-border">|</span>
              )}
              {providerLabel}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Stat Cards ─────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Main content area ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Left column: Health + Warmup + DNS ──────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Health Score Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Health Score
              </CardTitle>
              <CardDescription>
                Overall deliverability health of this account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Current Score
                </span>
                <span
                  className={`text-lg font-bold ${healthTextColor(healthScore)}`}
                >
                  {healthScore}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-primary/10">
                <div
                  className={`h-full rounded-full transition-all ${healthColor(healthScore)}`}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span
                  className={`font-medium ${healthTextColor(healthScore)}`}
                >
                  {healthLabel(healthScore)}
                </span>
                <span>100%</span>
              </div>
            </CardContent>
          </Card>

          {/* Warmup Panel */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Warmup
                </CardTitle>
                {warmupStatus && (
                  <Badge variant="secondary" className={phaseColors[warmupStatus.phase] || ""}>
                    {phaseLabels[warmupStatus.phase] || warmupStatus.phase}
                  </Badge>
                )}
              </div>
              {warmupStatus?.pause_reason && (
                <CardDescription className="text-amber-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {warmupStatus.pause_reason}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {warmupLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : warmupStatus ? (
                <div className="space-y-5">
                  {/* Progress bars */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Volume Progress</span>
                        <span className="font-medium">
                          {warmupStatus.current_allowed_volume} / {warmupStatus.target_volume}
                        </span>
                      </div>
                      <Progress
                        value={(warmupStatus.current_allowed_volume / Math.max(warmupStatus.target_volume, 1)) * 100}
                        className="h-2"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Sent Today</span>
                        <span className="font-medium">
                          {warmupStatus.actual_sent_today} / {warmupStatus.current_allowed_volume}
                        </span>
                      </div>
                      <Progress
                        value={(warmupStatus.actual_sent_today / Math.max(warmupStatus.current_allowed_volume, 1)) * 100}
                        className="h-2"
                      />
                    </div>
                  </div>

                  {/* Gauges */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Inbox Placement</p>
                      <p className={`text-xl font-bold ${gaugeColor(warmupStatus.inbox_placement_rate)}`}>
                        {Math.round(warmupStatus.inbox_placement_rate * 100)}%
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Warmup Health</p>
                      <p className={`text-xl font-bold ${gaugeColor(warmupStatus.warmup_health_score)}`}>
                        {Math.round(warmupStatus.warmup_health_score * 100)}%
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Account Health</p>
                      <p className={`text-xl font-bold ${gaugeColor(healthScore / 100)}`}>
                        {healthScore}%
                      </p>
                    </div>
                  </div>

                  {/* Risk flags */}
                  {warmupStatus.risk_flags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {warmupStatus.risk_flags.map((flag, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    {warmupStatus.phase === "paused" && (
                      <Button size="sm" onClick={handleResumeWarmup} disabled={warmupActionLoading}>
                        {warmupActionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                        Resume Warmup
                      </Button>
                    )}
                    {["ramping", "steady", "enrolling"].includes(warmupStatus.phase) && (
                      <Button size="sm" variant="outline" onClick={handlePauseWarmup} disabled={warmupActionLoading}>
                        {warmupActionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pause className="h-4 w-4 mr-1" />}
                        Pause Warmup
                      </Button>
                    )}
                    {warmupStatus.provider_name && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Provider: {warmupStatus.provider_name}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Flame className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    This account is not enrolled in warmup. Start warmup to build sender reputation.
                  </p>
                  <Button onClick={handleStartWarmup} disabled={warmupActionLoading}>
                    {warmupActionLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Flame className="h-4 w-4 mr-1" />}
                    Start Warmup
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warmup Metrics + Timeline Tabs */}
          {warmupStatus && (
            <Tabs defaultValue="metrics">
              <TabsList>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
              <TabsContent value="metrics">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Last 14 Days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {warmupStatus.recent_metrics.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={warmupStatus.recent_metrics}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="sent" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} name="Sent" />
                          <Area type="monotone" dataKey="opened" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} name="Opened" />
                          <Area type="monotone" dataKey="replied" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} name="Replied" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">
                        No metrics available yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="timeline">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Action Log</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {warmupTimeline.length > 0 ? (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {warmupTimeline.map((action) => (
                          <div key={action.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 text-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {formatActionType(action.action_type)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{action.source}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(action.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">No actions recorded yet.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* DNS Verification Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    DNS Verification
                  </CardTitle>
                  <CardDescription>
                    Email authentication records for deliverability
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyDns}
                  disabled={verifyingDns}
                >
                  {verifyingDns ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  {verifyingDns ? "Verifying..." : "Verify DNS"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* SPF */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {account.spf_verified ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">SPF Record</p>
                      <p className="text-xs text-muted-foreground">
                        Sender Policy Framework
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      account.spf_verified
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }
                  >
                    {account.spf_verified ? "Verified" : "Not Verified"}
                  </Badge>
                </div>

                {/* DKIM */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {account.dkim_verified ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">DKIM Record</p>
                      <p className="text-xs text-muted-foreground">
                        DomainKeys Identified Mail
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      account.dkim_verified
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }
                  >
                    {account.dkim_verified ? "Verified" : "Not Verified"}
                  </Badge>
                </div>

                {/* DMARC */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {account.dmarc_verified ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">DMARC Record</p>
                      <p className="text-xs text-muted-foreground">
                        Domain-based Message Authentication
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      account.dmarc_verified
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }
                  >
                    {account.dmarc_verified ? "Verified" : "Not Verified"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Right sidebar ────────────────────────────────── */}
        <div className="space-y-6">
          {/* Account Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </span>
                  <span className="font-medium text-xs text-right max-w-[180px] truncate">
                    {account.email}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Settings className="h-3.5 w-3.5" />
                    Provider
                  </span>
                  <span className="font-medium">{providerLabel}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Send className="h-3.5 w-3.5" />
                    Daily Limit
                  </span>
                  <Badge variant="secondary">{account.daily_limit}</Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Send className="h-3.5 w-3.5" />
                    Sent Today
                  </span>
                  <span className="font-medium">
                    {account.sent_today} / {account.daily_limit}
                  </span>
                </div>

                {account.smtp_host && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5" />
                      SMTP Host
                    </span>
                    <span className="font-medium text-xs text-right max-w-[150px] truncate">
                      {account.smtp_host}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Settings className="h-3.5 w-3.5" />
                    SMTP Port
                  </span>
                  <span className="font-medium">{account.smtp_port}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    TLS
                  </span>
                  <Badge
                    variant="secondary"
                    className={
                      account.smtp_use_tls
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }
                  >
                    {account.smtp_use_tls ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                {account.imap_host && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5" />
                      IMAP Host
                    </span>
                    <span className="font-medium text-xs text-right max-w-[150px] truncate">
                      {account.imap_host}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Settings className="h-3.5 w-3.5" />
                    IMAP Port
                  </span>
                  <span className="font-medium">{account.imap_port}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status & Activity Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Status & Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Account Status</span>
                <Badge
                  variant="secondary"
                  className={
                    account.is_active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-500"
                  }
                >
                  {account.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="text-xs font-medium">
                  {new Date(account.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Updated</span>
                <span className="text-xs font-medium">
                  {new Date(account.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
