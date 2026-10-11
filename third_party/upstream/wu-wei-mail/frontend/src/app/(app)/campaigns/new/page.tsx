"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Variable,
  Clock,
  Send,
  FileText,
  Eye,
  Loader2,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Account, Template, TemplatePreviewResponse } from "@/lib/types";
import { accountStatus } from "@/lib/types";
import { toast } from "sonner";

interface LeadList {
  id: string;
  name: string;
  member_count: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VARIABLES = [
  "{{first_name}}",
  "{{last_name}}",
  "{{email}}",
  "{{company}}",
  "{{title}}",
  "{{industry}}",
  "{{city}}",
  "{{country}}",
  "{{sender_name}}",
  "{{unsubscribe_link}}",
];

interface Variant {
  id: string;
  label: string;
  subject: string;
  body: string;
  weight: number;
}

interface SequenceStep {
  id: string;
  delayDays: number;
  variants: Variant[];
}

const TAB_ORDER = ["settings", "sequence", "leads", "accounts", "review"];

export default function NewCampaignPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("settings");
  const [launching, setLaunching] = useState(false);

  // Settings
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Copenhagen");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [sendDays, setSendDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [dailyLimit, setDailyLimit] = useState("50");

  // Sequence
  const [steps, setSteps] = useState<SequenceStep[]>([
    {
      id: "1",
      delayDays: 0,
      variants: [
        { id: "1a", label: "A", subject: "", body: "", weight: 100 },
      ],
    },
  ]);

  // Leads
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [leadListsLoading, setLeadListsLoading] = useState(true);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  // Template picker
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePickerTarget, setTemplatePickerTarget] = useState<{
    stepId: string;
    variantId: string;
  } | null>(null);

  // Email preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<TemplatePreviewResponse | null>(null);

  // Fetch lead lists and accounts on mount
  useEffect(() => {
    api
      .get<LeadList[]>("/api/leads/lists/all")
      .then(setLeadLists)
      .catch(() => toast.error("Failed to load lead lists"))
      .finally(() => setLeadListsLoading(false));

    api
      .get<Account[]>("/api/accounts")
      .then(setAccounts)
      .catch(() => toast.error("Failed to load sending accounts"))
      .finally(() => setAccountsLoading(false));
  }, []);

  function toggleDay(day: string) {
    setSendDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function addStep() {
    const newId = String(steps.length + 1);
    setSteps([
      ...steps,
      {
        id: newId,
        delayDays: 3,
        variants: [
          { id: `${newId}a`, label: "A", subject: "", body: "", weight: 100 },
        ],
      },
    ]);
  }

  function removeStep(stepId: string) {
    if (steps.length === 1) return;
    setSteps(steps.filter((s) => s.id !== stepId));
  }

  function addVariant(stepId: string) {
    setSteps(
      steps.map((s) => {
        if (s.id !== stepId) return s;
        const label = String.fromCharCode(65 + s.variants.length);
        const weight = Math.floor(100 / (s.variants.length + 1));
        const variants = [
          ...s.variants.map((v) => ({ ...v, weight })),
          {
            id: `${stepId}${label.toLowerCase()}`,
            label,
            subject: "",
            body: "",
            weight,
          },
        ];
        return { ...s, variants };
      })
    );
  }

  function removeVariant(stepId: string, variantId: string) {
    setSteps(
      steps.map((s) => {
        if (s.id !== stepId) return s;
        if (s.variants.length === 1) return s;
        const variants = s.variants.filter((v) => v.id !== variantId);
        const weight = Math.floor(100 / variants.length);
        return { ...s, variants: variants.map((v) => ({ ...v, weight })) };
      })
    );
  }

  function updateVariant(stepId: string, variantId: string, field: "subject" | "body" | "weight", value: string | number) {
    setSteps(
      steps.map((s) => {
        if (s.id !== stepId) return s;
        return {
          ...s,
          variants: s.variants.map((v) =>
            v.id === variantId ? { ...v, [field]: value } : v
          ),
        };
      })
    );
  }

  function updateStepDelay(stepId: string, days: number) {
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, delayDays: days } : s)));
  }

  function openTemplatePicker(stepId: string, variantId: string) {
    setTemplatePickerTarget({ stepId, variantId });
    setTemplateSearch("");
    setTemplatePickerOpen(true);
    if (!templatesLoaded) {
      api
        .get<Template[]>("/api/templates")
        .then((data) => {
          setTemplates(data);
          setTemplatesLoaded(true);
        })
        .catch(() => toast.error("Failed to load templates"));
    }
  }

  function selectTemplate(template: Template) {
    if (!templatePickerTarget) return;
    updateVariant(templatePickerTarget.stepId, templatePickerTarget.variantId, "subject", template.subject);
    updateVariant(templatePickerTarget.stepId, templatePickerTarget.variantId, "body", template.body);
    setTemplatePickerOpen(false);
    setTemplatePickerTarget(null);
    toast.success(`Template "${template.name}" loaded`);
  }

  const filteredTemplates = templates.filter((t) => {
    const q = templateSearch.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.category ?? "").toLowerCase().includes(q)
    );
  });

  async function openPreview(subject: string, body: string) {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await api.post<TemplatePreviewResponse>("/api/templates/preview", {
        subject,
        body,
        sample_data: {
          first_name: "Jane",
          last_name: "Smith",
          company: "Acme Corp",
          title: "VP Sales",
          email: "jane@acme.com",
        },
      });
      setPreviewResult(result);
    } catch {
      toast.error("Failed to generate preview");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  function goNext() {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < TAB_ORDER.length - 1) setActiveTab(TAB_ORDER[idx + 1]);
  }

  function goPrev() {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx > 0) setActiveTab(TAB_ORDER[idx - 1]);
  }

  async function handleLaunch() {
    if (!name.trim()) {
      toast.error("Please enter a campaign name");
      setActiveTab("settings");
      return;
    }

    setLaunching(true);
    try {
      // 1) Create campaign
      const startHour = parseInt(startTime.split(":")[0], 10);
      const endHour = parseInt(endTime.split(":")[0], 10);
      const campaign = await api.post<{ id: string; sequences: { id: string }[] }>("/api/campaigns", {
        name,
        timezone,
        send_start_hour: startHour,
        send_end_hour: endHour,
        daily_limit: parseInt(dailyLimit, 10) || 50,
        send_days: Object.fromEntries(
          ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d, i) =>
            [d, sendDays.includes(DAYS[i])]
          )
        ),
      });

      const campaignId = campaign.id;
      const sequenceId = campaign.sequences?.[0]?.id;

      // 2) Create steps and variants
      if (sequenceId) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const stepResp = await api.post<{ id: string }>(
            `/api/campaigns/${campaignId}/sequences/${sequenceId}/steps`,
            {
              order: i,
              step_type: "email",
              wait_days: step.delayDays,
              subject: step.variants[0]?.subject ?? "",
              body: step.variants[0]?.body ?? "",
            }
          );

          // Create variants for this step
          for (const variant of step.variants) {
            if (!variant.subject && !variant.body) continue;
            await api.post(`/api/campaigns/steps/${stepResp.id}/variants`, {
              name: variant.label,
              subject: variant.subject,
              body: variant.body,
              weight: variant.weight,
            });
          }
        }
      }

      // 3) Add leads from selected lists
      if (selectedLists.length > 0) {
        await api.post(`/api/campaigns/${campaignId}/leads-from-lists`, {
          list_ids: selectedLists,
        });
      }

      // 4) Add sending accounts
      if (selectedAccounts.length > 0) {
        await api.post(`/api/campaigns/${campaignId}/accounts`, {
          account_ids: selectedAccounts,
        });
      }

      // 5) Start campaign
      await api.post(`/api/campaigns/${campaignId}/start`);

      toast.success("Campaign launched!");
      router.push("/campaigns");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to launch campaign";
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }

  const currentIdx = TAB_ORDER.indexOf(activeTab);
  const activeAccounts = accounts.filter((a) => {
    const status = accountStatus(a);
    return status === "connected" || status === "warming";
  });

  const selectedLeadCount = leadLists
    .filter((l) => selectedLists.includes(l.id))
    .reduce((sum, l) => sum + l.member_count, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Campaign</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set up your email sequence and launch
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="sequence">Sequence</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        {/* ---- Settings ---- */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
              <CardDescription>Basic settings for your campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., EU Yacht Brokers Q2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Copenhagen">Europe/Copenhagen (CET)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                    <SelectItem value="America/New_York">America/New York (EST)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los Angeles (PST)</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send Window</CardTitle>
              <CardDescription>When should emails be sent?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Send Days</Label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((day) => (
                    <Button
                      key={day}
                      variant={sendDays.includes(day) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDay(day)}
                      className="w-12"
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Daily Send Limit (per account)</Label>
                <Input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="w-32"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Sequence ---- */}
        <TabsContent value="sequence" className="space-y-4 mt-4">
          {steps.map((step, stepIdx) => (
            <Card key={step.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      {stepIdx + 1}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {stepIdx === 0 ? "Initial Email" : `Follow-up ${stepIdx}`}
                      </CardTitle>
                      {stepIdx > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Wait</span>
                          <Input
                            type="number"
                            value={step.delayDays}
                            onChange={(e) =>
                              updateStepDelay(step.id, parseInt(e.target.value) || 0)
                            }
                            className="w-16 h-6 text-xs"
                            min={1}
                          />
                          <span className="text-xs text-muted-foreground">days</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addVariant(step.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Variant
                    </Button>
                    {steps.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {step.variants.map((variant) => (
                  <div key={variant.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Variant {variant.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs gap-1"
                          onClick={() => openTemplatePicker(step.id, variant.id)}
                        >
                          <FileText className="h-3 w-3" />
                          Load Template
                        </Button>
                        {step.variants.length > 1 && (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={variant.weight}
                              onChange={(e) =>
                                updateVariant(step.id, variant.id, "weight", parseInt(e.target.value) || 0)
                              }
                              className="w-16 h-6 text-xs"
                              min={0}
                              max={100}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>
                      {step.variants.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeVariant(step.id, variant.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Subject line..."
                          value={variant.subject}
                          onChange={(e) =>
                            updateVariant(step.id, variant.id, "subject", e.target.value)
                          }
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="shrink-0">
                              <Variable className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {VARIABLES.map((v) => (
                              <DropdownMenuItem
                                key={v}
                                onClick={() =>
                                  updateVariant(
                                    step.id,
                                    variant.id,
                                    "subject",
                                    variant.subject + v
                                  )
                                }
                              >
                                {v}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Email body..."
                          value={variant.body}
                          onChange={(e) =>
                            updateVariant(step.id, variant.id, "body", e.target.value)
                          }
                          rows={5}
                          className="flex-1"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="shrink-0 self-start">
                              <Variable className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {VARIABLES.map((v) => (
                              <DropdownMenuItem
                                key={v}
                                onClick={() =>
                                  updateVariant(
                                    step.id,
                                    variant.id,
                                    "body",
                                    variant.body + v
                                  )
                                }
                              >
                                {v}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => openPreview(variant.subject, variant.body)}
                          disabled={!variant.subject && !variant.body}
                        >
                          <Eye className="h-3 w-3" />
                          Preview
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={addStep} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Follow-up Step
          </Button>
        </TabsContent>

        {/* ---- Leads ---- */}
        <TabsContent value="leads" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Lead Lists</CardTitle>
              <CardDescription>Choose which lead lists to include in this campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {leadListsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : leadLists.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No lead lists yet. Import leads first.
                </p>
              ) : (
                leadLists.map((list) => (
                  <div
                    key={list.id}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedLists.includes(list.id)}
                        onCheckedChange={(checked) =>
                          setSelectedLists(
                            checked
                              ? [...selectedLists, list.id]
                              : selectedLists.filter((id) => id !== list.id)
                          )
                        }
                      />
                      <div>
                        <p className="text-sm font-medium">{list.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {list.member_count.toLocaleString()} leads
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{list.member_count.toLocaleString()}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Or Upload CSV</CardTitle>
              <CardDescription>Import leads directly into this campaign</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Drop your CSV file here, or{" "}
                  <Button variant="link" className="px-0 text-primary" asChild>
                    <a href="/leads/import">go to import page</a>
                  </Button>
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Accounts ---- */}
        <TabsContent value="accounts" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sending Accounts</CardTitle>
              <CardDescription>Select which accounts to send from</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {accountsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
              ) : activeAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No active accounts. Add a sending account first.
                </p>
              ) : (
                activeAccounts.map((account) => {
                  const status = accountStatus(account);
                  const healthScore = Math.round(account.health_score * 100);
                  return (
                    <div
                      key={account.id}
                      className="flex items-center justify-between border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedAccounts.includes(account.id)}
                          onCheckedChange={(checked) =>
                            setSelectedAccounts(
                              checked
                                ? [...selectedAccounts, account.id]
                                : selectedAccounts.filter((id) => id !== account.id)
                            )
                          }
                        />
                        <div>
                          <p className="text-sm font-medium">{account.email}</p>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={
                                status === "connected"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }
                            >
                              {status === "connected" ? "Ready" : "Warming"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Health: {healthScore}%
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {account.sent_today}/{account.daily_limit} today
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Review ---- */}
        <TabsContent value="review" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Summary</CardTitle>
              <CardDescription>Review your campaign before launching</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Settings Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Settings</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Name:</span>
                  <span>{name || "(not set)"}</span>
                  <span className="text-muted-foreground">Timezone:</span>
                  <span>{timezone}</span>
                  <span className="text-muted-foreground">Send Window:</span>
                  <span>{startTime} – {endTime}</span>
                  <span className="text-muted-foreground">Send Days:</span>
                  <span>{sendDays.join(", ")}</span>
                  <span className="text-muted-foreground">Daily Limit:</span>
                  <span>{dailyLimit} per account</span>
                </div>
              </div>

              <Separator />

              {/* Sequence Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Sequence ({steps.length} steps)</h3>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div key={step.id} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                          {idx + 1}
                        </div>
                        <span className="text-sm font-medium">
                          {idx === 0 ? "Initial Email" : `Follow-up ${idx}`}
                          {idx > 0 && (
                            <span className="text-muted-foreground font-normal ml-1">
                              (wait {step.delayDays} days)
                            </span>
                          )}
                        </span>
                        <Badge variant="outline" className="text-xs ml-auto">
                          {step.variants.length} variant{step.variants.length > 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Leads Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Leads</h3>
                <p className="text-sm">
                  {selectedLists.length > 0
                    ? `${selectedLists.length} list(s) selected — ${selectedLeadCount.toLocaleString()} leads total`
                    : "No lists selected"}
                </p>
              </div>

              <Separator />

              {/* Accounts Summary */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Sending Accounts</h3>
                <p className="text-sm">
                  {selectedAccounts.length > 0
                    ? `${selectedAccounts.length} account(s) selected`
                    : "No accounts selected"}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" className="gap-2" onClick={handleLaunch} disabled={launching}>
              <Send className="h-4 w-4" />
              {launching ? "Launching..." : "Launch Campaign"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentIdx === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {currentIdx < TAB_ORDER.length - 1 && (
          <Button onClick={goNext}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>

      {/* Template Picker Dialog */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Load Template</DialogTitle>
            <DialogDescription>
              Choose a template to populate the subject and body
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto -mx-2 px-2 space-y-2">
            {!templatesLoaded ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))
            ) : filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {templateSearch ? "No templates match your search" : "No templates yet"}
              </p>
            ) : (
              filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="w-full text-left border rounded-lg p-3 hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => selectTemplate(template)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">
                      {template.name}
                    </span>
                    {template.category && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {template.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {template.subject || "(no subject)"}
                  </p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
            <DialogDescription>
              Preview with sample personalization data
            </DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewResult ? (
            <div className="space-y-4">
              {previewResult.errors.length > 0 && (
                <div className="rounded-md bg-destructive/10 p-3">
                  {previewResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">{err}</p>
                  ))}
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-3 border-b">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium text-foreground">To:</span>
                    Jane Smith &lt;jane@acme.com&gt;
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Subject:</span>
                    <span>{previewResult.subject}</span>
                  </div>
                </div>
                <div className="px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {previewResult.body}
                </div>
              </div>
              {previewResult.variables_found.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Variables:</span>
                  {previewResult.variables_found.map((v) => (
                    <Badge key={v} variant="outline" className="text-xs">
                      {v}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
