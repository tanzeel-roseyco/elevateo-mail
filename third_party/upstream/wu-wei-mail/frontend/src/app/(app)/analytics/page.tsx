"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  MailOpen,
  MessageSquare,
  AlertTriangle,
  CalendarIcon,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, differenceInDays, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { api } from "@/lib/api";
import type { DashboardStats, TimeSeriesPoint } from "@/lib/types";
import { toast } from "sonner";

interface CampaignComparisonItem {
  campaign_id?: string;
  campaign_name: string;
  reply_rate: number;
  total_sent: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chart, setChart] = useState<TimeSeriesPoint[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignComparisonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from, to };
  });

  const fetchData = useCallback((days: number) => {
    setLoading(true);
    void Promise.all([
      api.get<DashboardStats>("/api/analytics/dashboard"),
      api.get<TimeSeriesPoint[]>(`/api/analytics/time-series?days=${days}`),
      api.get<CampaignComparisonItem[]>("/api/analytics/campaigns"),
    ])
      .then(([s, c, cmp]) => {
        setStats(s);
        setChart(c);
        setCampaigns(
          cmp
            .filter((item) => item.total_sent > 0)
            .sort((a, b) => b.reply_rate - a.reply_rate)
            .slice(0, 5)
        );
      })
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Loading starts as true from useState; initial fetch uses Promise callbacks
    // to avoid synchronous setState within the effect body.
    void Promise.all([
      api.get<DashboardStats>("/api/analytics/dashboard"),
      api.get<TimeSeriesPoint[]>("/api/analytics/time-series?days=30"),
      api.get<CampaignComparisonItem[]>("/api/analytics/campaigns"),
    ])
      .then(([s, c, cmp]) => {
        setStats(s);
        setChart(c);
        setCampaigns(
          cmp
            .filter((item) => item.total_sent > 0)
            .sort((a, b) => b.reply_rate - a.reply_rate)
            .slice(0, 5)
        );
      })
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  function handleDateRangeChange(range: DateRange | undefined) {
    setDateRange(range);
    if (range?.from && range?.to) {
      const days = differenceInDays(range.to, range.from) + 1;
      fetchData(Math.max(days, 1));
    }
  }

  // Compute derived chart data with rates
  const chartWithRates = chart.map((point) => ({
    ...point,
    openRate: point.sent > 0 ? Math.round((point.opens / point.sent) * 1000) / 10 : 0,
    replyRate: point.sent > 0 ? Math.round((point.replies / point.sent) * 1000) / 10 : 0,
  }));
  const selectedPresetDays =
    dateRange?.from && dateRange?.to
      ? differenceInDays(dateRange.to, dateRange.from) + 1
      : null;

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
  
  const statCards = stats
    ? [
        {
          title: "Total Sent",
          value: stats.total_sent.toLocaleString(),
          icon: Send,
        },
        {
          title: "Open Rate",
          value: `${stats.open_rate}%`,
          icon: MailOpen,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your campaign performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <Button
              key={d}
              variant={selectedPresetDays === d ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const to = new Date();
                const from = new Date();
                from.setDate(from.getDate() - (d - 1));
                handleDateRangeChange({ from, to });
              }}
            >
              {d}d
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM d")} -{" "}
                      {format(dateRange.to, "MMM d, yyyy")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  "Pick a date range"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeChange}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Stat Cards */}
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
          : statCards.map((stat) => (
              <Card key={stat.title}>
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

      {/* Charts Row 1: Sends + Open Rate */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {dateRange?.from && dateRange?.to
                ? `Sends: ${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
                : "Sends Over Last 30 Days"}
            </CardTitle>
            <CardDescription>Daily email volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartWithRates}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                      tickFormatter={formatDateLabel}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid oklch(0.90 0.01 70)",
                        boxShadow: "0 4px 12px oklch(0.40 0.03 60 / 0.1)",
                        fontSize: "13px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sent"
                      stroke={CHART_TERRACOTTA}
                      strokeWidth={2}
                      dot={false}
                      name="Sends"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open Rate Trend</CardTitle>
            <CardDescription>Daily open rate (%)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartWithRates}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                      tickFormatter={formatDateLabel}
                    />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid oklch(0.90 0.01 70)",
                        boxShadow: "0 4px 12px oklch(0.40 0.03 60 / 0.1)",
                        fontSize: "13px",
                      }}
                      formatter={(value) => [`${value}%`, "Open Rate"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="openRate"
                      stroke={CHART_SAGE}
                      strokeWidth={2}
                      dot={false}
                      name="Open Rate"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Reply Rate + Campaign Comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reply Rate Trend</CardTitle>
            <CardDescription>Daily reply rate (%)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartWithRates}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                      tickFormatter={formatDateLabel}
                    />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid oklch(0.90 0.01 70)",
                        boxShadow: "0 4px 12px oklch(0.40 0.03 60 / 0.1)",
                        fontSize: "13px",
                      }}
                      formatter={(value) => [`${value}%`, "Reply Rate"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="replyRate"
                      stroke={CHART_VIOLET}
                      strokeWidth={2}
                      dot={false}
                      name="Reply Rate"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Comparison</CardTitle>
            <CardDescription>Top 5 campaigns by reply rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : campaigns.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  No campaign data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={campaigns}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      unit="%"
                    />
                    <YAxis
                      type="category"
                      dataKey="campaign_name"
                      tick={{ fontSize: 11 }}
                      width={150}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid oklch(0.90 0.01 70)",
                        boxShadow: "0 4px 12px oklch(0.40 0.03 60 / 0.1)",
                        fontSize: "13px",
                      }}
                      formatter={(value) => [`${value}%`, "Reply Rate"]}
                    />
                    <Bar
                      dataKey="reply_rate"
                      fill={CHART_TERRACOTTA}
                      radius={[0, 4, 4, 0]}
                      name="Reply Rate"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {!loading && campaigns.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-sm font-medium text-muted-foreground">Campaign Performance</p>
                <ul className="space-y-1">
                  {campaigns.map((c) => (
                    <li key={c.campaign_name} className="flex items-center gap-1 text-sm">
                      <span className="text-muted-foreground">&bull;</span>
                      <span className="truncate">{c.campaign_name}</span>
                      <span className="text-muted-foreground">
                        &mdash; {c.reply_rate}% reply rate
                      </span>
                      <Link
                        href={
                          c.campaign_id
                            ? `/campaigns/${c.campaign_id}`
                            : `/campaigns?search=${encodeURIComponent(c.campaign_name)}`
                        }
                        className="ml-1 inline-flex items-center gap-0.5 text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

