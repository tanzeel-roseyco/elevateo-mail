"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface NodeStats {
  total: number;
  by_status: Record<string, number>;
}

interface WorkflowStats {
  workflow_id: string;
  nodes: Record<string, NodeStats>;
  events: Record<string, Record<string, number>>;
  lead_states: Record<string, number>;
}

interface AnalyticsOverlayProps {
  campaignId: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onStatsLoaded?: (stats: WorkflowStats | null) => void;
}

export function AnalyticsOverlay({ campaignId, enabled, onToggle, onStatsLoaded }: AnalyticsOverlayProps) {
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<WorkflowStats>(`/api/campaigns/${campaignId}/workflow/stats`);
      setStats(data);
      onStatsLoaded?.(data);
    } catch {
      toast.error("Failed to load workflow analytics");
      onStatsLoaded?.(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, onStatsLoaded]);

  useEffect(() => {
    if (enabled) {
      fetchStats();
    } else {
      setStats(null);
      onStatsLoaded?.(null);
    }
  }, [enabled, fetchStats, onStatsLoaded]);

  const totalLeads = stats
    ? Object.values(stats.lead_states).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={() => onToggle(!enabled)}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Analytics
      </Button>

      {enabled && stats && (
        <>
          <Badge variant="secondary" className="text-xs">
            {totalLeads} lead{totalLeads !== 1 ? "s" : ""} in workflow
          </Badge>
          {Object.entries(stats.lead_states).map(([status, count]) => (
            <Badge key={status} variant="outline" className="text-[10px]">
              {status}: {count}
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchStats}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Get the analytics badge text for a specific node, used to overlay on the canvas.
 */
export function getNodeAnalyticsBadge(
  nodeId: string,
  stats: WorkflowStats | null,
): { label: string; count: number } | null {
  if (!stats) return null;

  const nodeStats = stats.nodes[nodeId];
  const eventStats = stats.events[nodeId];

  if (!nodeStats && !eventStats) return null;

  const leadCount = nodeStats?.total ?? 0;
  const eventCount = eventStats
    ? Object.values(eventStats).reduce((a, b) => a + b, 0)
    : 0;

  if (leadCount === 0 && eventCount === 0) return null;

  if (leadCount > 0) {
    return { label: `${leadCount} lead${leadCount !== 1 ? "s" : ""}`, count: leadCount };
  }

  return { label: `${eventCount} event${eventCount !== 1 ? "s" : ""}`, count: eventCount };
}
