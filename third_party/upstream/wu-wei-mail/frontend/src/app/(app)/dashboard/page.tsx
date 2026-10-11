"use client";

import { useEffect, useState } from "react";
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
  Megaphone,
  Send,
  MessageSquare,
  AlertTriangle,
  Plus,
  Upload,
  Mail,
} from "lucide-react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import type { DashboardStats, TimeSeriesPoint, Account } from "@/lib/types";
import { OnboardingChecklist } from "@/components/onboarding-checklist";

interface RecentActivityItem {
  id: string;
  campaign_name: string;
  event_type: string;
  lead_email?: string;
  occurred_at: string;
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    open: "Email opened",
    click: "Link clicked",
    reply: "Reply received",
    bounce: "Email bounced",
    unsubscribe: "Unsubscribed",
  };
  return map[type] ?? type;
}

function eventColor(type: string) {
  if (type === "reply") return "text-emerald-600";
  if (type === "bounce") return "text-red-500";
  if (type === "open") return "text-amber-600";
  if (type === "click") return "text-violet-500";
  return "text-muted-foreground";
}

function eventDot(type: string) {
  if (type === "reply") return "bg-emerald-500";
  if (type === "bounce") return "bg-red-500";
  if (type === "open") return "bg-amber-500";
  if (type === "click") return "bg-violet-500";
  return "bg-muted-foreground";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateLabel(dateStr: string) {
  try {
    return format(parseISO(dateStr), "MMM dd");
  } catch {
    return dateStr;
  }
}

/* Warm chart colors */
const CHART_TERRACOTTA = "oklch(0.58 0.16 28)";
const CHART_SAGE = "oklch(0.62 0.08 155)";
const CHART_VIOLET = "oklch(0.60 0.10 310)";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chart, setChart] = useState<TimeSeriesPoint[]>([]);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<DashboardStats>("/api/analytics/dashboard"),
      api.get<TimeSeriesPoint[]>("/api/analytics/time-series?days=30"),
      api.get<RecentActivityItem[]>("/api/analytics/recent-activity?limit=10"),
      api.get<Account[]>("/api/accounts").catch(() => [] as Account[]),
    ])
      .then(([s, c, a, accts]) => {
        setStats(s);
        setChart(c);
        setActivity(a);
        setAccounts(accts);
      })
      .catch(() => {
        // API may not be reachable yet — show empty state
      })
      .finally(() => setLoading(false));
  }, []);

  const statCards = stats
    ? [
        {
          title: "Active Campaigns",
          value: stats.active_campaigns,
          icon: Megaphone,
        },
        {
          title: "Emails Sent Today",
          value: stats.emails_today.toLocaleString(),
          icon: Send,
        },
        {
          title: "Reply Rate",
          value: `${stats.reply_rate}%`,
          icon: MessageSquare,
        },
        {
          title: "Bounce Rate",
          value: `${stats.bounce_rate}%`,
          icon: AlertTriangle,
        },
      ]
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Section heading */}
      <h2 className="font-display text-3xl font-semibold tracking-tight">Dashboard</h2>

      {/* Onboarding Checklist */}
      {!loading && (
        <OnboardingChecklist stats={stats} accountCount={accounts.length} />
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : statCards.map((stat, i) => (
              <Card
                key={stat.title}
                className={`animate-fade-in-up stagger-${i + 1} hover:warm-shadow-md transition-shadow`}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Chart + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 animate-fade-in-up stagger-5">
          <CardHeader>
            <CardTitle className="font-display">Sends Over Last 30 Days</CardTitle>
            <CardDescription>Email sends, opens, and replies</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="fillSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_TERRACOTTA} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={CHART_TERRACOTTA} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="date"
                      className="text-xs"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                      tickFormatter={formatDateLabel}
                    />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid oklch(0.90 0.01 70)",
                        boxShadow: "0 4px 12px oklch(0.40 0.03 60 / 0.1)",
                        fontSize: "13px",
                      }}
                      labelFormatter={(label) => formatDateLabel(String(label))}
                    />
                    <Area
                      type="monotone"
                      dataKey="sent"
                      stroke={CHART_TERRACOTTA}
                      strokeWidth={2}
                      fill="url(#fillSent)"
                      dot={false}
                      name="Sends"
                    />
                    <Line
                      type="monotone"
                      dataKey="opens"
                      stroke={CHART_SAGE}
                      strokeWidth={2}
                      dot={false}
                      name="Opens"
                    />
                    <Line
                      type="monotone"
                      dataKey="replies"
                      stroke={CHART_VIOLET}
                      strokeWidth={2}
                      dot={false}
                      name="Replies"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="animate-fade-in-up stagger-6">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                asChild
                className="w-full justify-start gap-2"
                size="sm"
              >
                <Link href="/campaigns/new">
                  <Plus className="h-4 w-4" />
                  New Campaign
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start gap-2"
                size="sm"
              >
                <Link href="/leads/import">
                  <Upload className="h-4 w-4" />
                  Import Leads
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start gap-2"
                size="sm"
              >
                <Link href="/inbox">
                  <Mail className="h-4 w-4" />
                  Check Inbox
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Send Capacity */}
          {!loading && accounts.length > 0 && (() => {
            const totalCapacity = accounts.reduce((sum, a) => sum + a.daily_limit, 0);
            const usedToday = accounts.reduce((sum, a) => sum + a.sent_today, 0);
            const remaining = totalCapacity - usedToday;
            const usagePct = totalCapacity > 0 ? Math.round((usedToday / totalCapacity) * 100) : 0;
            const capacityColor =
              usagePct > 85
                ? "text-red-600"
                : usagePct >= 60
                  ? "text-amber-600"
                  : "text-emerald-600";
            const progressColor =
              usagePct > 85
                ? "[&>div]:bg-red-500"
                : usagePct >= 60
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-emerald-500";

            return (
              <Card className="animate-fade-in-up stagger-7">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Send Capacity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${capacityColor}`}>
                      {usagePct}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {remaining} remaining
                    </span>
                  </div>
                  <Progress value={usagePct} className={`h-2 ${progressColor}`} />
                  <p className="text-xs text-muted-foreground">
                    {usedToday.toLocaleString()} / {totalCapacity.toLocaleString()} sent today
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          <Card className="animate-fade-in-up stagger-8">
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
              <CardDescription>All-time totals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Total Leads</span>
                  <Badge variant="secondary">
                    {stats?.total_leads ?? 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Total Sent</span>
                  <Badge variant="secondary">
                    {stats?.total_sent ?? 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Open Rate</span>
                  <Badge variant="secondary">{stats?.open_rate ?? 0}%</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <Card className="animate-fade-in-up stagger-9">
        <CardHeader>
          <CardTitle className="font-display">Recent Activity</CardTitle>
          <CardDescription>
            Latest events across all campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No activity yet. Start a campaign to see events here.
            </p>
          ) : (
            <div className="space-y-4">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border-b border-border/50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${eventDot(item.event_type)}`}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {item.campaign_name}
                      </p>
                      <p
                        className={`text-xs ${eventColor(item.event_type)}`}
                      >
                        {eventLabel(item.event_type)}
                        {item.lead_email && ` · ${item.lead_email}`}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {timeAgo(item.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

