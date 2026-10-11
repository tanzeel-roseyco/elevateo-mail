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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Upload,
  Search,
  ListPlus,
  Trash2,
  Plus,
  FolderOpen,
  X,
  Pencil,
  Save,
  ExternalLink,
  ListMinus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Send,
  MailOpen,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  UserPlus,
  UserMinus,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type {
  Lead,
  LeadStatus,
  LeadList,
  Campaign,
  LeadPersonalizationRequest,
  LeadPersonalizationResponse,
  LeadPersonalizationJobCreateResponse,
  LeadPersonalizationJobStatusResponse,
} from "@/lib/types";
import { leadDisplayName } from "@/lib/types";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ─── Status config ───────────────────────────────────────────────
const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
  replied: { label: "Replied", className: "bg-primary/10 text-primary" },
  bounced: { label: "Bounced", className: "bg-red-50 text-red-700" },
  unsubscribed: { label: "Unsubscribed", className: "bg-stone-100 text-stone-600" },
};

// ─── Paginated response shape from the API ───────────────────────
interface LeadsResponse {
  leads: Lead[];
  total: number;
  skip: number;
  limit: number;
}

// ─── Lead Activity types ─────────────────────────────────────────
interface LeadActivity {
  id: string;
  type:
    | "email_sent"
    | "email_opened"
    | "email_clicked"
    | "email_replied"
    | "email_bounced"
    | "added_to_campaign"
    | "removed_from_campaign";
  campaign_name?: string;
  subject?: string;
  occurred_at: string;
  metadata?: Record<string, unknown>;
}

const activityConfig: Record<
  LeadActivity["type"],
  { label: string; icon: typeof Send; dotColor: string }
> = {
  email_sent: { label: "Email sent", icon: Send, dotColor: "bg-orange-600" },
  email_opened: { label: "Email opened", icon: MailOpen, dotColor: "bg-amber-500" },
  email_clicked: { label: "Link clicked", icon: MousePointerClick, dotColor: "bg-violet-500" },
  email_replied: { label: "Reply received", icon: MessageSquare, dotColor: "bg-emerald-500" },
  email_bounced: { label: "Email bounced", icon: AlertTriangle, dotColor: "bg-red-500" },
  added_to_campaign: { label: "Added to campaign", icon: UserPlus, dotColor: "bg-sky-500" },
  removed_from_campaign: { label: "Removed from campaign", icon: UserMinus, dotColor: "bg-stone-400" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

function formatPersonalizationJobStatus(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

// ─── Lead Detail Drawer ──────────────────────────────────────────
function LeadDetailDrawer({
  leadId,
  open,
  onOpenChange,
  onLeadUpdated,
  onLeadDeleted,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated: () => void;
  onLeadDeleted: () => void;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [activeTab, setActiveTab] = useState("details");
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  useEffect(() => {
    if (!leadId || !open) {
      setLead(null);
      setEditing(false);
      setActiveTab("details");
      setActivities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<Lead>(`/api/leads/${leadId}`)
      .then((data) => {
        if (!cancelled) {
          setLead(data);
          setDraft({});
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load lead details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, open]);

  // Fetch activity when the Activity tab is selected
  useEffect(() => {
    if (activeTab !== "activity" || !leadId || !open) return;
    let cancelled = false;
    setActivitiesLoading(true);
    api
      .get<LeadActivity[]>(`/api/leads/${leadId}/activity`)
      .then((data) => {
        if (!cancelled) setActivities(data);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setActivitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, leadId, open]);

  function startEditing() {
    if (!lead) return;
    setDraft({
      first_name: lead.first_name ?? "",
      last_name: lead.last_name ?? "",
      email: lead.email,
      company: lead.company ?? "",
      title: lead.title ?? "",
      phone: lead.phone ?? "",
      linkedin_url: lead.linkedin_url ?? "",
      website: lead.website ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      country: lead.country ?? "",
      industry: lead.industry ?? "",
      status: lead.status,
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!lead) return;
    setSaving(true);
    try {
      const updated = await api.patch<Lead>(`/api/leads/${lead.id}`, draft);
      setLead(updated);
      setEditing(false);
      toast.success("Lead updated");
      onLeadUpdated();
    } catch {
      toast.error("Failed to update lead");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!lead) return;
    setDeleting(true);
    try {
      await api.delete(`/api/leads/${lead.id}`);
      toast.success("Lead deleted");
      onOpenChange(false);
      onLeadDeleted();
    } catch {
      toast.error("Failed to delete lead");
    } finally {
      setDeleting(false);
    }
  }

  function renderField(label: string, field: keyof Lead) {
    const value = lead ? (lead as unknown as Record<string, unknown>)[field] : undefined;
    if (editing) {
      return (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {field === "status" ? (
            <Select
              value={(draft.status as string) ?? ""}
              onValueChange={(v) => setDraft((prev) => ({ ...prev, status: v as LeadStatus }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-8 text-sm"
              value={(draft[field as keyof typeof draft] as string) ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [field]: e.target.value }))
              }
            />
          )}
        </div>
      );
    }

    const displayValue = typeof value === "string" ? value : "";
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {field === "status" && lead ? (
          <div>
            <Badge variant="secondary" className={statusConfig[lead.status]?.className}>
              {statusConfig[lead.status]?.label}
            </Badge>
          </div>
        ) : field === "linkedin_url" && displayValue ? (
          <p className="text-sm">
            <a
              href={displayValue}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {displayValue}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ) : field === "website" && displayValue ? (
          <p className="text-sm">
            <a
              href={displayValue.startsWith("http") ? displayValue : `https://${displayValue}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {displayValue}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ) : (
          <p className="text-sm">{displayValue || <span className="text-muted-foreground italic">--</span>}</p>
        )}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {loading ? (
              <Skeleton className="h-6 w-40" />
            ) : lead ? (
              leadDisplayName(lead)
            ) : (
              "Lead Details"
            )}
          </SheetTitle>
          <SheetDescription>
            {lead?.email ?? ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : lead ? (
          <div className="p-4 space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">
                  <Clock className="h-3 w-3 mr-1" />
                  Activity
                </TabsTrigger>
              </TabsList>

              {/* ── Details Tab ── */}
              <TabsContent value="details">
                <div className="space-y-6 pt-4">
                  {/* Actions row */}
                  <div className="flex gap-2 justify-end">
                    {editing ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(false)}
                          disabled={saving}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                          <Save className="h-3 w-3 mr-1" />
                          {saving ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={startEditing}>
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteConfirmOpen(true)}
                          disabled={deleting}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    {renderField("First Name", "first_name")}
                    {renderField("Last Name", "last_name")}
                  </div>
                  {renderField("Email", "email")}
                  <div className="grid grid-cols-2 gap-4">
                    {renderField("Company", "company")}
                    {renderField("Title", "title")}
                  </div>
                  {renderField("Phone", "phone")}
                  {renderField("LinkedIn URL", "linkedin_url")}
                  {renderField("Website", "website")}
                  <div className="grid grid-cols-3 gap-4">
                    {renderField("City", "city")}
                    {renderField("State", "state")}
                    {renderField("Country", "country")}
                  </div>
                  {renderField("Industry", "industry")}
                  {renderField("Status", "status")}

                  {/* Custom fields (read-only display) */}
                  {lead.custom_fields && Object.keys(lead.custom_fields).length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground font-medium">Custom Fields</Label>
                      <div className="rounded-lg border p-3 space-y-2">
                        {Object.entries(lead.custom_fields).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{key}</span>
                            <span>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="pt-4 border-t text-xs text-muted-foreground space-y-1">
                    <p>
                      Created:{" "}
                      {new Date(lead.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p>
                      Updated:{" "}
                      {new Date(lead.updated_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* ── Activity Tab ── */}
              <TabsContent value="activity">
                <div className="pt-4">
                  {activitiesLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1" />
                          <div className="space-y-1 flex-1">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Clock className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                      <p className="text-xs text-muted-foreground/70">
                        Activity will appear here once this lead is part of a campaign.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-4">
                        {activities.map((activity) => {
                          const config = activityConfig[activity.type];
                          const Icon = config.icon;
                          return (
                            <div key={activity.id} className="relative flex gap-3 pl-0">
                              {/* Dot */}
                              <div
                                className={`relative z-10 mt-1 h-[11px] w-[11px] rounded-full shrink-0 ring-2 ring-background ${config.dotColor}`}
                              />
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-1.5">
                                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium leading-tight">
                                      {config.label}
                                    </p>
                                    {activity.subject && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {activity.subject}
                                      </p>
                                    )}
                                    {activity.campaign_name && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        <span className="inline-flex items-center gap-1">
                                          <Megaphone className="h-3 w-3" />
                                          {activity.campaign_name}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground/70 mt-1 pl-5">
                                  {timeAgo(activity.occurred_at)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Lead"
          description={
            <>
              Are you sure you want to delete <span className="font-medium text-foreground">{lead ? leadDisplayName(lead) : ""}</span>? This action cannot be undone.
            </>
          }
          confirmLabel="Delete Lead"
          loading={deleting}
          onConfirm={handleDelete}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Create Lead List Dialog ─────────────────────────────────────
function CreateListDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("List name is required");
      return;
    }
    setCreating(true);
    try {
      await api.post("/api/leads/lists", {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success(`List "${name.trim()}" created`);
      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Lead List</DialogTitle>
          <DialogDescription>
            Create a new list to organize your leads
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="list-name">Name</Label>
            <Input
              id="list-name"
              placeholder="e.g. Enterprise Prospects"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-desc">Description (optional)</Label>
            <Textarea
              id="list-desc"
              placeholder="Describe this list..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? "Creating..." : "Create List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead Lists Panel Dialog ─────────────────────────────────────
function LeadListsDialog({
  open,
  onOpenChange,
  leadLists,
  onListSelected,
  onRefreshLists,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadLists: LeadList[];
  onListSelected: (listId: string) => void;
  onRefreshLists: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lead Lists</DialogTitle>
            <DialogDescription>
              Manage your lead lists
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {leadLists.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No lead lists yet. Create one to get started.
              </p>
            ) : (
              leadLists.map((list) => (
                <div
                  key={list.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    onListSelected(list.id);
                    onOpenChange(false);
                  }}
                >
                  <div>
                    <p className="text-sm font-medium">{list.name}</p>
                    {list.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{list.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {list.member_count} lead{list.member_count !== 1 ? "s" : ""}
                  </Badge>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                setShowCreate(true);
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              New List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreateListDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={onRefreshLists}
      />
    </>
  );
}

// ─── Main Leads Page ─────────────────────────────────────────────
const PAGE_SIZE = 50;
const PERSONALIZATION_SOURCE_COLUMNS = [
  { value: "website", label: "Website" },
  { value: "linkedin_url", label: "LinkedIn URL" },
  { value: "company", label: "Company" },
  { value: "title", label: "Title" },
  { value: "industry", label: "Industry" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "country", label: "Country" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "custom_field", label: "Custom Field" },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Lead lists
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [listFilter, setListFilter] = useState("all");
  const [showListsDialog, setShowListsDialog] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);

  // Bulk delete confirm
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // List-based AI personalization
  const [showPersonalizeDialog, setShowPersonalizeDialog] = useState(false);
  const [personalizationListId, setPersonalizationListId] = useState("");
  const [personalizationSourceColumn, setPersonalizationSourceColumn] = useState("website");
  const [personalizationSourceCustomField, setPersonalizationSourceCustomField] = useState("");
  const [personalizationTargetField, setPersonalizationTargetField] = useState("personalization");
  const [personalizationTone, setPersonalizationTone] = useState("professional");
  const [personalizationInstructions, setPersonalizationInstructions] = useState("");
  const [personalizationLimit, setPersonalizationLimit] = useState(1);
  const [personalizationLimitTouched, setPersonalizationLimitTouched] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const [personalizationJobId, setPersonalizationJobId] = useState<string | null>(null);
  const [personalizationJobStatus, setPersonalizationJobStatus] = useState<string>("queued");
  const [personalizationProgress, setPersonalizationProgress] = useState<{
    processed: number;
    total: number;
    updated: number;
    skipped: number;
    failed: number;
    progress_percent: number;
  } | null>(null);
  const [personalizationResult, setPersonalizationResult] = useState<LeadPersonalizationResponse | null>(null);

  // Campaigns (for bulk add to campaign)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  // Lead detail drawer
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Derived pagination
  const totalPages = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));

  const getListLeadCount = useCallback(
    (targetListId: string): number => {
      const selectedList = leadLists.find((list) => list.id === targetListId);
      return Math.max(1, selectedList?.member_count ?? 1);
    },
    [leadLists]
  );

  // Debounce search input — reset to page 1 on new search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ─── Fetch leads (server-side paginated) ───────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("skip", String((page - 1) * PAGE_SIZE));
      params.set("limit", String(PAGE_SIZE));
      if (listFilter !== "all") {
        params.set("list_id", listFilter);
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (searchDebounced.trim()) {
        params.set("search", searchDebounced.trim());
      }
      const data = await api.get<LeadsResponse>(`/api/leads?${params.toString()}`);
      setLeads(data.leads);
      setTotalLeads(data.total);
    } catch {
      toast.error("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [listFilter, statusFilter, searchDebounced, page]);

  // ─── Fetch lead lists ──────────────────────────────────────────
  const fetchLeadLists = useCallback(async () => {
    try {
      const data = await api.get<LeadList[]>("/api/leads/lists/all");
      setLeadLists(data);
    } catch {
      // silently fail -- lead lists are supplementary
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchLeadLists();
  }, [fetchLeadLists]);

  useEffect(() => {
    if (personalizationListId || leadLists.length === 0) return;
    if (listFilter !== "all" && leadLists.some((l) => l.id === listFilter)) {
      setPersonalizationListId(listFilter);
      setPersonalizationLimit(getListLeadCount(listFilter));
      setPersonalizationLimitTouched(false);
      return;
    }
    setPersonalizationListId(leadLists[0].id);
    setPersonalizationLimit(getListLeadCount(leadLists[0].id));
    setPersonalizationLimitTouched(false);
  }, [leadLists, listFilter, personalizationListId, getListLeadCount]);

  useEffect(() => {
    if (!personalizationListId || personalizationLimitTouched) return;
    setPersonalizationLimit(getListLeadCount(personalizationListId));
  }, [personalizationListId, personalizationLimitTouched, getListLeadCount]);

  useEffect(() => {
    if (!personalizationJobId) return;
    let cancelled = false;

    async function pollJob() {
      try {
        const status = await api.get<LeadPersonalizationJobStatusResponse>(
          `/api/leads/personalize/jobs/${personalizationJobId}`
        );
        if (cancelled) return;

        setPersonalizationJobStatus(status.status);
        setPersonalizationProgress(status.progress);

        if (status.status === "completed") {
          setPersonalizing(false);
          setPersonalizationJobId(null);
          if (status.result) {
            setPersonalizationResult(status.result);
            toast.success(
              `Personalization complete: ${status.result.updated} updated, ${status.result.skipped} skipped, ${status.result.failed} failed`
            );
          } else {
            toast.success("Personalization complete");
          }
          fetchLeads();
          return;
        }

        if (status.status === "failed") {
          setPersonalizing(false);
          setPersonalizationJobId(null);
          setPersonalizationJobStatus("failed");
          toast.error(status.error || "Personalization job failed");
        }
      } catch (error) {
        if (cancelled) return;
        setPersonalizing(false);
        setPersonalizationJobId(null);
        setPersonalizationJobStatus("failed");
        if (error instanceof ApiError) {
          toast.error(`Failed to fetch personalization job status: ${error.detail}`);
        } else if (error instanceof Error) {
          toast.error(`Failed to fetch personalization job status: ${error.message}`);
        } else {
          toast.error("Failed to fetch personalization job status");
        }
      }
    }

    void pollJob();
    const timer = window.setInterval(() => {
      void pollJob();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [personalizationJobId, fetchLeads]);

  // ─── Fetch campaigns (for bulk add-to-campaign) ───────────────
  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await api.get<Campaign[]>("/api/campaigns");
      setCampaigns(data);
    } catch {
      // silently fail -- campaigns are supplementary
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ─── Selection helpers (operates on current page) ──────────────
  const allSelected = leads.length > 0 && leads.every((l) => selected.includes(l.id));

  function toggleAll() {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(leads.map((l) => l.id));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  // ─── Bulk delete ───────────────────────────────────────────────
  async function handleBulkDelete() {
    if (selected.length === 0) return;
    setBulkDeleting(true);
    try {
      await api.post("/api/leads/bulk", {
        lead_ids: selected,
        action: "delete",
      });
      toast.success(`Deleted ${selected.length} lead${selected.length > 1 ? "s" : ""}`);
      setSelected([]);
      setBulkDeleteOpen(false);
      fetchLeads();
      fetchLeadLists();
    } catch {
      toast.error("Failed to delete leads");
    } finally {
      setBulkDeleting(false);
    }
  }

  // ─── Bulk add to list ──────────────────────────────────────────
  async function handleAddToList(listId: string) {
    if (selected.length === 0) return;
    try {
      await api.post("/api/leads/bulk", {
        lead_ids: selected,
        action: "add_to_list",
        list_id: listId,
      });
      const list = leadLists.find((l) => l.id === listId);
      toast.success(
        `Added ${selected.length} lead${selected.length > 1 ? "s" : ""} to "${list?.name ?? "list"}"`
      );
      setSelected([]);
      fetchLeadLists();
      if (listFilter !== "all") fetchLeads();
    } catch {
      toast.error("Failed to add leads to list");
    }
  }

  // ─── Bulk remove from list ─────────────────────────────────────
  async function handleRemoveFromList(listId: string) {
    if (selected.length === 0) return;
    try {
      await api.post("/api/leads/bulk", {
        lead_ids: selected,
        action: "remove_from_list",
        list_id: listId,
      });
      const list = leadLists.find((l) => l.id === listId);
      toast.success(
        `Removed ${selected.length} lead${selected.length > 1 ? "s" : ""} from "${list?.name ?? "list"}"`
      );
      setSelected([]);
      fetchLeadLists();
      if (listFilter === listId) fetchLeads();
    } catch {
      toast.error("Failed to remove leads from list");
    }
  }

  // ─── Bulk add to campaign ─────────────────────────────────────
  async function handleAddToCampaign(campaignId: string) {
    if (selected.length === 0) return;
    const campaign = campaigns.find((c) => c.id === campaignId);
    try {
      // Try the dedicated bulk endpoint first, fall back to /leads
      try {
        await api.post(`/api/campaigns/${campaignId}/leads-from-selection`, {
          lead_ids: selected,
        });
      } catch {
        await api.post(`/api/campaigns/${campaignId}/leads`, {
          lead_ids: selected,
        });
      }
      toast.success(
        `Added ${selected.length} lead${selected.length > 1 ? "s" : ""} to "${campaign?.name ?? "campaign"}"`
      );
      setSelected([]);
    } catch {
      toast.error("Failed to add leads to campaign");
    }
  }

  async function handleRunPersonalization() {
    if (!personalizationListId) {
      toast.error("Select a lead list");
      return;
    }
    if (personalizationSourceColumn === "custom_field" && !personalizationSourceCustomField.trim()) {
      toast.error("Custom field key is required");
      return;
    }
    if (!personalizationTargetField.trim()) {
      toast.error("Target variable is required");
      return;
    }

    const selectedList = leadLists.find((list) => list.id === personalizationListId);
    const defaultTarget = Math.max(1, selectedList?.member_count ?? 1);
    const manualLimit = Math.max(1, Math.min(10000, personalizationLimit || 1));
    const requestedTotal = personalizationLimitTouched ? manualLimit : defaultTarget;

    setPersonalizing(true);
    setPersonalizationResult(null);
    setPersonalizationJobId(null);
    setPersonalizationJobStatus("queued");
    setPersonalizationProgress({
      processed: 0,
      total: requestedTotal,
      updated: 0,
      skipped: 0,
      failed: 0,
      progress_percent: 0,
    });

    try {
      const payload: LeadPersonalizationRequest = {
        list_id: personalizationListId,
        source_column: personalizationSourceColumn,
        target_field: personalizationTargetField.trim(),
        tone: personalizationTone,
        instructions: personalizationInstructions.trim() || undefined,
      };
      if (personalizationLimitTouched) {
        payload.limit = manualLimit;
      }
      if (personalizationSourceColumn === "custom_field") {
        payload.source_custom_field = personalizationSourceCustomField.trim();
      }

      const job = await api.post<LeadPersonalizationJobCreateResponse>(
        "/api/leads/personalize/jobs",
        payload
      );
      setPersonalizationJobId(job.job_id);
      setPersonalizationJobStatus(job.status || "queued");
      toast.success("Personalization job queued");
    } catch (error) {
      setPersonalizationProgress(null);
      setPersonalizationJobStatus("failed");
      if (error instanceof ApiError) {
        toast.error(`Failed to run personalization: ${error.detail}`);
      } else if (error instanceof Error) {
        toast.error(`Failed to run personalization: ${error.message}`);
      } else {
        toast.error("Failed to run personalization");
      }
      setPersonalizing(false);
    }
  }

  // ─── Open lead detail drawer ───────────────────────────────────
  function openLeadDrawer(id: string) {
    setDrawerLeadId(id);
    setDrawerOpen(true);
  }

  const activeList = leadLists.find((l) => l.id === listFilter);
  const hasActiveFilters =
    searchDebounced.trim().length > 0 ||
    statusFilter !== "all" ||
    listFilter !== "all";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? "Loading..."
              : activeList
              ? `${totalLeads.toLocaleString()} leads in "${activeList.name}"`
              : `${totalLeads.toLocaleString()} total leads across all lists`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (!personalizationListId && leadLists.length > 0) {
                const nextListId = listFilter !== "all" ? listFilter : leadLists[0].id;
                setPersonalizationListId(nextListId);
                setPersonalizationLimit(getListLeadCount(nextListId));
              } else if (personalizationListId) {
                setPersonalizationLimit(getListLeadCount(personalizationListId));
              }
              setPersonalizationLimitTouched(false);
              setPersonalizationResult(null);
              if (!personalizing) {
                setPersonalizationJobId(null);
                setPersonalizationJobStatus("queued");
                setPersonalizationProgress(null);
              }
              setShowPersonalizeDialog(true);
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Personalize Leads
          </Button>
          <Button variant="outline" onClick={() => setShowListsDialog(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Lists
            {leadLists.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {leadLists.length}
              </Badge>
            )}
          </Button>
          <Button asChild>
            <Link href="/leads/import">
              <Upload className="h-4 w-4 mr-2" />
              Import Leads
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters + Bulk Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              </SelectContent>
            </Select>

            {/* Lead list filter */}
            <Select
              value={listFilter}
              onValueChange={(val) => {
                setListFilter(val);
                setSelected([]);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All lists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lists</SelectItem>
                {leadLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name} ({list.member_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selected.length > 0 && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground">
                  {selected.length} selected
                </span>

                {/* Add to List dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <ListPlus className="h-3 w-3 mr-1" />
                      Add to List
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Select a list</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {leadLists.length === 0 ? (
                      <DropdownMenuItem onClick={() => setShowCreateList(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Create a list first
                      </DropdownMenuItem>
                    ) : (
                      leadLists.map((list) => (
                        <DropdownMenuItem
                          key={list.id}
                          onClick={() => handleAddToList(list.id)}
                        >
                          {list.name}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {list.member_count}
                          </span>
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowCreateList(true)}>
                      <Plus className="h-3 w-3 mr-1" />
                      New List
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Remove from List dropdown */}
                {leadLists.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <ListMinus className="h-3 w-3 mr-1" />
                        Remove from List
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Select a list</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {leadLists.map((list) => (
                        <DropdownMenuItem
                          key={list.id}
                          onClick={() => handleRemoveFromList(list.id)}
                        >
                          {list.name}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {list.member_count}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Add to Campaign dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Megaphone className="h-3 w-3 mr-1" />
                      Add to Campaign
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Select a campaign</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(() => {
                      const eligible = campaigns.filter(
                        (c) => c.status === "active" || c.status === "draft"
                      );
                      if (eligible.length === 0) {
                        return (
                          <DropdownMenuItem disabled>
                            <span className="text-muted-foreground">No active or draft campaigns</span>
                          </DropdownMenuItem>
                        );
                      }
                      return eligible.map((campaign) => (
                        <DropdownMenuItem
                          key={campaign.id}
                          onClick={() => handleAddToCampaign(campaign.id)}
                        >
                          <span className="truncate">{campaign.name}</span>
                          <Badge
                            variant="secondary"
                            className={`ml-auto text-xs shrink-0 ${
                              campaign.status === "active"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {campaign.status}
                          </Badge>
                        </DropdownMenuItem>
                      ));
                    })()}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Personalization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[140px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[180px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[120px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[100px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[220px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-[80px] rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-[70px]" />
                    </TableCell>
                  </TableRow>
                ))
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <p>
                        {hasActiveFilters
                          ? "No leads match your current search or filters."
                          : "No leads yet. Import your first leads to get started."}
                      </p>
                      {hasActiveFilters ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearch("");
                            setSearchDebounced("");
                            setStatusFilter("all");
                            setListFilter("all");
                            setPage(1);
                          }}
                        >
                          Clear Filters
                        </Button>
                      ) : (
                        <Button asChild size="sm">
                          <Link href="/leads/import">Import Leads</Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const sc = statusConfig[lead.status];
                  const personalization = lead.custom_fields?.personalization;
                  return (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        // Don't open drawer when clicking the checkbox
                        if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                        openLeadDrawer(lead.id);
                      }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(lead.id)}
                          onCheckedChange={() => toggleOne(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{leadDisplayName(lead)}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.email}</TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.title}</TableCell>
                      <TableCell className="max-w-[320px]">
                        {personalization ? (
                          <span className="block truncate text-sm" title={personalization}>
                            {personalization}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={sc.className}>
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalLeads)} of{" "}
            {totalLeads.toLocaleString()} leads
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-3 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showPersonalizeDialog} onOpenChange={setShowPersonalizeDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Personalize Leads</DialogTitle>
            <DialogDescription>
              Generate AI personalization for a list and store it as a merge variable column.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Lead List</Label>
                <Select
                  value={personalizationListId}
                  onValueChange={(value) => {
                    setPersonalizationListId(value);
                    setPersonalizationLimit(getListLeadCount(value));
                    setPersonalizationLimitTouched(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select list" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name} ({list.member_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Source Column</Label>
                <Select value={personalizationSourceColumn} onValueChange={setPersonalizationSourceColumn}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONALIZATION_SOURCE_COLUMNS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {personalizationSourceColumn === "custom_field" && (
              <div className="space-y-2">
                <Label htmlFor="personalization-source-custom">Custom Field Key</Label>
                <Input
                  id="personalization-source-custom"
                  placeholder="e.g. product_interest"
                  value={personalizationSourceCustomField}
                  onChange={(e) => setPersonalizationSourceCustomField(e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="personalization-target-field">Target Variable</Label>
                <Input
                  id="personalization-target-field"
                  placeholder="personalization"
                  value={personalizationTargetField}
                  onChange={(e) => setPersonalizationTargetField(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Available as {`{{${personalizationTargetField || "personalization"}}}`} and always mirrored to{" "}
                  {"{{personalization}}"}.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="personalization-limit">Leads to Process</Label>
                <Input
                  id="personalization-limit"
                  type="number"
                  min={1}
                  max={10000}
                  value={personalizationLimit}
                  onChange={(e) => {
                    setPersonalizationLimit(Number(e.target.value));
                    setPersonalizationLimitTouched(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Default is all leads in the selected list ({getListLeadCount(personalizationListId)}).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={personalizationTone} onValueChange={setPersonalizationTone}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="personalization-instructions">Extra Instructions (optional)</Label>
              <Textarea
                id="personalization-instructions"
                placeholder="e.g. Mention sustainability initiatives when relevant."
                rows={3}
                value={personalizationInstructions}
                onChange={(e) => setPersonalizationInstructions(e.target.value)}
              />
            </div>

            {(personalizing || personalizationProgress) && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    Job Status: {formatPersonalizationJobStatus(personalizationJobStatus)}
                  </p>
                  {personalizationJobId && (
                    <span className="text-xs text-muted-foreground">
                      Job ID: {personalizationJobId.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, personalizationProgress?.progress_percent ?? 0))}
                  className="h-2"
                />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                  <span>
                    Processed: {personalizationProgress?.processed ?? 0}/{personalizationProgress?.total ?? 0}
                  </span>
                  <span>Updated: {personalizationProgress?.updated ?? 0}</span>
                  <span>Skipped: {personalizationProgress?.skipped ?? 0}</span>
                  <span>Failed: {personalizationProgress?.failed ?? 0}</span>
                </div>
              </div>
            )}

            {personalizationResult && (
              <div className="rounded-md border p-3 space-y-3">
                <p className="text-sm font-medium">
                  Result: {personalizationResult.updated} updated, {personalizationResult.skipped} skipped,{" "}
                  {personalizationResult.failed} failed
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {personalizationResult.results.map((item) => (
                    <div
                      key={item.lead_id}
                      className="text-xs rounded border px-2 py-1 flex items-start justify-between gap-3"
                    >
                      <span className="font-medium truncate">{item.email}</span>
                      <span className="text-muted-foreground truncate">
                        {item.status === "updated" ? item.personalization : item.reason ?? item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPersonalizeDialog(false)}>
              Close
            </Button>
            <Button onClick={handleRunPersonalization} disabled={personalizing || leadLists.length === 0}>
              {personalizing ? "Running..." : "Queue Personalization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Lists Dialog */}
      <LeadListsDialog
        open={showListsDialog}
        onOpenChange={setShowListsDialog}
        leadLists={leadLists}
        onListSelected={(listId) => {
          setListFilter(listId);
          setSelected([]);
        }}
        onRefreshLists={fetchLeadLists}
      />

      {/* Create List Dialog (standalone, triggered from dropdown) */}
      <CreateListDialog
        open={showCreateList}
        onOpenChange={setShowCreateList}
        onCreated={fetchLeadLists}
      />

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        leadId={drawerLeadId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onLeadUpdated={fetchLeads}
        onLeadDeleted={() => {
          fetchLeads();
          fetchLeadLists();
        }}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete Leads"
        description={`Are you sure you want to delete ${selected.length} selected lead${selected.length !== 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete Leads"
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
