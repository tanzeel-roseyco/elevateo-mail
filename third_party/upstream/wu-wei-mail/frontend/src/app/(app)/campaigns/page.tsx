"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Play, Pause, Trash2, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Campaign, CampaignStatus, CampaignStats } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const statusConfig: Record<
  CampaignStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  draft: { label: "Draft", variant: "secondary", className: "bg-stone-100 text-stone-600 hover:bg-stone-100" },
  active: { label: "Active", variant: "default", className: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50" },
  paused: { label: "Paused", variant: "secondary", className: "bg-amber-50 text-amber-700 hover:bg-amber-50" },
  completed: { label: "Completed", variant: "secondary", className: "bg-primary/10 text-primary hover:bg-primary/10" },
  archived: { label: "Archived", variant: "secondary", className: "bg-stone-100 text-stone-500 hover:bg-stone-100" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, CampaignStats>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.get<Campaign[]>("/api/campaigns"),
      api.get<CampaignStats[]>("/api/analytics/campaigns").catch(() => [] as CampaignStats[]),
    ])
      .then(([c, stats]) => {
        setCampaigns(c);
        const map: Record<string, CampaignStats> = {};
        for (const s of stats) map[s.campaign_id] = s;
        setStatsMap(map);
      })
      .catch(() => toast.error("Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function handleAction(id: string, action: "start" | "pause" | "resume") {
    try {
      await api.post(`/api/campaigns/${id}/${action}`);
      toast.success(`Campaign ${action}ed`);
      load();
    } catch {
      toast.error(`Failed to ${action} campaign`);
    }
  }

  function openDeleteConfirm(campaign: Campaign) {
    setDeletingCampaign(campaign);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingCampaign) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/campaigns/${deletingCampaign.id}`);
      toast.success("Campaign deleted");
      setDeleteOpen(false);
      load();
    } catch {
      toast.error("Failed to delete campaign");
    } finally {
      setDeleteLoading(false);
    }
  }

  const filtered = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "all";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your email campaigns and sequences
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      <div className="flex flex-col items-center gap-3">
                        <p>
                          {hasActiveFilters
                            ? "No campaigns match your current filters."
                            : "No campaigns yet. Create your first campaign to get started."}
                        </p>
                        {hasActiveFilters ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearch("");
                              setStatusFilter("all");
                            }}
                          >
                            Clear Filters
                          </Button>
                        ) : (
                          <Button asChild size="sm">
                            <Link href="/campaigns/new">Create Campaign</Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((campaign) => {
                    const sc = statusConfig[campaign.status] ?? statusConfig.draft;
                    const stats = statsMap[campaign.id];
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className={sc.className}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{stats?.total_leads ?? "--"}</TableCell>
                        <TableCell className="text-right">{stats?.total_sent ?? "--"}</TableCell>
                        <TableCell className="text-right">{stats?.total_opens ?? "--"}</TableCell>
                        <TableCell className="text-right">{stats?.total_replies ?? "--"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(campaign.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/campaigns/${campaign.id}`}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                              {campaign.status === "active" ? (
                                <DropdownMenuItem onClick={() => handleAction(campaign.id, "pause")}>
                                  <Pause className="h-4 w-4 mr-2" />
                                  Pause
                                </DropdownMenuItem>
                              ) : campaign.status === "paused" ? (
                                <DropdownMenuItem onClick={() => handleAction(campaign.id, "resume")}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Resume
                                </DropdownMenuItem>
                              ) : campaign.status === "draft" ? (
                                <DropdownMenuItem onClick={() => handleAction(campaign.id, "start")}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Launch
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => openDeleteConfirm(campaign)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Campaign"
        description={
          <>
            Are you sure you want to delete <span className="font-medium text-foreground">{deletingCampaign?.name}</span>? This action cannot be undone. All campaign data including sent emails and analytics will be permanently removed.
          </>
        }
        confirmLabel="Delete Campaign"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
