"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Inbox,
  Settings,
  Map,
  BarChart3,
  Plus,
  Save,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  FlaskConical,
  Wand2,
  Sparkles,
  Shield,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  AutoResponderConfig,
  ResponderRegion,
  RegionConditionRule,
  ResponderRule,
  ResponderQueueItem,
  AutoResponderAnalytics,
  AutoResponderTimeSeriesPoint,
} from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusColors: Record<string, string> = {
  responded: "bg-emerald-50 text-emerald-700",
  sent: "bg-emerald-50 text-emerald-700",
  escalated: "bg-amber-50 text-amber-700",
  pending: "bg-primary/10 text-primary",
  skipped: "bg-stone-100 text-stone-600",
  rejected: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
};

const actionColors: Record<string, string> = {
  auto_respond: "bg-emerald-50 text-emerald-700",
  escalate: "bg-amber-50 text-amber-700",
  skip: "bg-stone-100 text-stone-600",
};

const operatorOptions = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts with" },
  { value: "in", label: "In list" },
  { value: "not_in", label: "Not in list" },
];

// ─── Setup Wizard ───────────────────────────────────────────

const WIZARD_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-3-haiku", label: "Claude 3 Haiku" },
];

const WIZARD_TONE_OPTIONS: { value: "formal" | "professional" | "casual" | "friendly"; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
];

function SetupWizard({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const [step, setStep] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [wizEnabled, setWizEnabled] = useState(true);
  const [wizModel, setWizModel] = useState("gpt-4o-mini");

  // Step 2
  const [wizTone, setWizTone] = useState<"formal" | "professional" | "casual" | "friendly">("professional");
  const [wizBrandDesc, setWizBrandDesc] = useState("");
  const [wizForbidden, setWizForbidden] = useState("");
  const [wizEscalation, setWizEscalation] = useState("");

  // Step 3
  const [wizRuleName, setWizRuleName] = useState("Default Auto-Respond Rule");
  const [wizRuleAction, setWizRuleAction] = useState<"auto_respond" | "escalate" | "skip">("auto_respond");
  const [wizRuleDelay, setWizRuleDelay] = useState(5);

  async function handleFinish() {
    setSaving(true);
    try {
      // 1. Save config
      const configPayload: Record<string, unknown> = {
        is_enabled: wizEnabled,
        ai_model: wizModel,
        tone: wizTone,
        brand_description: wizBrandDesc || undefined,
        forbidden_words: wizForbidden ? wizForbidden.split(",").map((s) => s.trim()).filter(Boolean) : [],
        escalation_keywords: wizEscalation ? wizEscalation.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      await api.patch("/api/auto-responder/config", configPayload);

      // 2. Create first rule
      await api.post("/api/auto-responder/rules", {
        name: wizRuleName,
        action: wizRuleAction,
        priority: 0,
        is_active: true,
        delay_minutes: wizRuleDelay,
      });

      toast.success("Auto-responder setup complete!");
      onComplete();
    } catch {
      toast.error("Failed to complete setup. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const stepIcons = [
    <Sparkles key="1" className="h-5 w-5" />,
    <Shield key="2" className="h-5 w-5" />,
    <Wand2 key="3" className="h-5 w-5" />,
  ];

  const stepLabels = ["Model", "Voice", "Rule"];

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center h-9 w-9 rounded-full border-2 transition-colors ${
                  s === step
                    ? "border-primary bg-primary text-primary-foreground"
                    : s < step
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground/50"
                }`}
              >
                {s < step ? (
                  <Check className="h-4 w-4" />
                ) : (
                  stepIcons[s - 1]
                )}
              </div>
              <span
                className={`text-sm font-medium hidden sm:inline ${
                  s === step ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {stepLabels[s - 1]}
              </span>
              {s < 3 && (
                <div
                  className={`w-10 h-0.5 ${
                    s < step ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="border-primary/20 shadow-lg">
          {/* ── Step 1: Enable & Choose Model ── */}
          {step === 1 && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="font-display text-2xl">Welcome to Auto-Responder</CardTitle>
                <CardDescription className="text-base mt-1">
                  Automatically respond to incoming replies with AI-generated messages.
                  Let&apos;s get you set up in a few quick steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Enable Auto-Responder</Label>
                    <p className="text-xs text-muted-foreground">
                      Turn on automatic AI responses
                    </p>
                  </div>
                  <Switch checked={wizEnabled} onCheckedChange={setWizEnabled} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-model">AI Model</Label>
                  <Select value={wizModel} onValueChange={setWizModel}>
                    <SelectTrigger id="wiz-model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {WIZARD_MODEL_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose which AI model generates your responses
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={onSkip}
                    className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
                  >
                    Skip Setup
                  </button>
                  <Button onClick={() => setStep(2)} className="gap-2">
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* ── Step 2: Set Tone & Guardrails ── */}
          {step === 2 && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="font-display text-2xl">Tone & Guardrails</CardTitle>
                <CardDescription className="text-base mt-1">
                  Define your brand voice and set safety boundaries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="space-y-3">
                  <Label>Tone</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {WIZARD_TONE_OPTIONS.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setWizTone(t.value)}
                        className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                          wizTone === t.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-brand">Brand Description</Label>
                  <Textarea
                    id="wiz-brand"
                    value={wizBrandDesc}
                    onChange={(e) => setWizBrandDesc(e.target.value)}
                    rows={2}
                    placeholder="Describe your brand voice in a sentence or two (optional)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-forbidden">Forbidden Words</Label>
                  <Input
                    id="wiz-forbidden"
                    value={wizForbidden}
                    onChange={(e) => setWizForbidden(e.target.value)}
                    placeholder="guarantee, free, discount, ... (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated words the AI must never use
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-escalation">Escalation Keywords</Label>
                  <Input
                    id="wiz-escalation"
                    value={wizEscalation}
                    onChange={(e) => setWizEscalation(e.target.value)}
                    placeholder="unsubscribe, legal, refund, ... (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Words that should escalate to human review
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)} className="gap-2">
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* ── Step 3: Create First Rule ── */}
          {step === 3 && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Wand2 className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="font-display text-2xl">Create Your First Rule</CardTitle>
                <CardDescription className="text-base mt-1">
                  Rules determine how incoming replies are handled.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="wiz-rule-name">Rule Name</Label>
                  <Input
                    id="wiz-rule-name"
                    value={wizRuleName}
                    onChange={(e) => setWizRuleName(e.target.value)}
                    placeholder="Default Auto-Respond Rule"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-rule-action">Action</Label>
                  <Select
                    value={wizRuleAction}
                    onValueChange={(v) => setWizRuleAction(v as typeof wizRuleAction)}
                  >
                    <SelectTrigger id="wiz-rule-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto_respond">Auto-respond</SelectItem>
                      <SelectItem value="escalate">Escalate</SelectItem>
                      <SelectItem value="skip">Skip</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose what happens when this rule matches
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wiz-rule-delay">Response Delay (minutes)</Label>
                  <Input
                    id="wiz-rule-delay"
                    type="number"
                    min={0}
                    value={wizRuleDelay}
                    onChange={(e) => setWizRuleDelay(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Wait this many minutes before sending the response
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleFinish}
                    disabled={saving || !wizRuleName}
                    className="gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Finish Setup
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export default function AutoResponderPage() {
  const [activeTab, setActiveTab] = useState("queue");

  // ── Queue state ──
  const [queueItems, setQueueItems] = useState<ResponderQueueItem[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueFilter, setQueueFilter] = useState("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Config state ──
  const [config, setConfig] = useState<AutoResponderConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [apiKey, setApiKey] = useState("");

  // Config form fields
  const [isEnabled, setIsEnabled] = useState(false);
  const [aiModel, setAiModel] = useState("");
  const [tone, setTone] = useState<"formal" | "professional" | "casual" | "friendly">("professional");
  const [brandDescription, setBrandDescription] = useState("");
  const [examplePhrases, setExamplePhrases] = useState("");
  const [forbiddenWords, setForbiddenWords] = useState("");
  const [signatureTemplate, setSignatureTemplate] = useState("");
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [maxResponseLength, setMaxResponseLength] = useState(500);
  const [escalationKeywords, setEscalationKeywords] = useState("");
  const [maxResponsesPerHour, setMaxResponsesPerHour] = useState(50);
  const [cooldownMinutes, setCooldownMinutes] = useState(5);

  // ── Regions & Rules state ──
  const [regions, setRegions] = useState<ResponderRegion[]>([]);
  const [rules, setRules] = useState<ResponderRule[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);

  // Region dialog
  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [regionDescription, setRegionDescription] = useState("");
  const [regionPriority, setRegionPriority] = useState(0);
  const [regionConditions, setRegionConditions] = useState<RegionConditionRule[]>([
    { field: "", operator: "eq", value: "" },
  ]);
  const [regionMatchAll, setRegionMatchAll] = useState(true);
  const [regionToneOverride, setRegionToneOverride] = useState("");
  const [regionCustomPrompt, setRegionCustomPrompt] = useState("");
  const [savingRegion, setSavingRegion] = useState(false);

  // Region delete confirm
  const [regionDeleteOpen, setRegionDeleteOpen] = useState(false);
  const [deletingRegion, setDeletingRegion] = useState<ResponderRegion | null>(null);
  const [regionDeleteLoading, setRegionDeleteLoading] = useState(false);

  // Rule delete confirm
  const [ruleDeleteOpen, setRuleDeleteOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<ResponderRule | null>(null);
  const [ruleDeleteLoading, setRuleDeleteLoading] = useState(false);

  // Rule dialog
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [ruleAction, setRuleAction] = useState<"auto_respond" | "escalate" | "skip">("auto_respond");
  const [rulePriority, setRulePriority] = useState(0);
  const [ruleCampaignId, setRuleCampaignId] = useState("");
  const [ruleRegionId, setRuleRegionId] = useState("");
  const [ruleDelayMinutes, setRuleDelayMinutes] = useState(0);
  const [ruleResponseTemplate, setRuleResponseTemplate] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  // ── Analytics state ──
  const [analytics, setAnalytics] = useState<AutoResponderAnalytics | null>(null);
  const [timeSeries, setTimeSeries] = useState<AutoResponderTimeSeriesPoint[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsDays, setAnalyticsDays] = useState(30);

  // ── Wizard state ──
  const [wizardSkipped, setWizardSkipped] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // ── Data Fetchers ─────────────────────────────────────────

  const fetchQueue = useCallback(async (status?: string) => {
    setQueueLoading(true);
    try {
      const params = new URLSearchParams({ skip: "0", limit: "50" });
      if (status && status !== "all") params.set("status", status);
      const data = await api.get<{ items: ResponderQueueItem[]; total: number; skip: number; limit: number }>(
        `/api/auto-responder/queue?${params.toString()}`
      );
      setQueueItems(data.items);
      setQueueTotal(data.total);
    } catch {
      toast.error("Failed to load queue");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const data = await api.get<AutoResponderConfig>("/api/auto-responder/config");
      setConfig(data);
      setIsEnabled(data.is_enabled);
      setAiModel(data.ai_model);
      setTone(data.tone);
      setBrandDescription(data.brand_description ?? "");
      setExamplePhrases(data.example_phrases?.join(", ") ?? "");
      setForbiddenWords(data.forbidden_words?.join(", ") ?? "");
      setSignatureTemplate(data.signature_template ?? "");
      setConfidenceThreshold(data.confidence_threshold);
      setMaxResponseLength(data.max_response_length);
      setEscalationKeywords(data.escalation_keywords?.join(", ") ?? "");
      setMaxResponsesPerHour(data.max_responses_per_hour);
      setCooldownMinutes(data.cooldown_minutes);
    } catch {
      toast.error("Failed to load configuration");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const fetchRegions = useCallback(async () => {
    setRegionsLoading(true);
    try {
      const data = await api.get<ResponderRegion[]>("/api/auto-responder/regions");
      setRegions(data);
    } catch {
      toast.error("Failed to load regions");
    } finally {
      setRegionsLoading(false);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const data = await api.get<ResponderRule[]>("/api/auto-responder/rules");
      setRules(data);
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async (days: number) => {
    setAnalyticsLoading(true);
    try {
      const [summary, series] = await Promise.all([
        api.get<AutoResponderAnalytics>(`/api/auto-responder/analytics/summary?days=${days}`),
        api.get<AutoResponderTimeSeriesPoint[]>(`/api/auto-responder/analytics/time-series?days=${days}`),
      ]);
      setAnalytics(summary);
      setTimeSeries(series);
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // ── Initial fetch for wizard detection ───────────────────

  useEffect(() => {
    async function loadInitial() {
      try {
        const [cfg, rls] = await Promise.all([
          api.get<AutoResponderConfig>("/api/auto-responder/config"),
          api.get<ResponderRule[]>("/api/auto-responder/rules"),
        ]);
        setConfig(cfg);
        setIsEnabled(cfg.is_enabled);
        setAiModel(cfg.ai_model);
        setTone(cfg.tone);
        setBrandDescription(cfg.brand_description ?? "");
        setExamplePhrases(cfg.example_phrases?.join(", ") ?? "");
        setForbiddenWords(cfg.forbidden_words?.join(", ") ?? "");
        setSignatureTemplate(cfg.signature_template ?? "");
        setConfidenceThreshold(cfg.confidence_threshold);
        setMaxResponseLength(cfg.max_response_length);
        setEscalationKeywords(cfg.escalation_keywords?.join(", ") ?? "");
        setMaxResponsesPerHour(cfg.max_responses_per_hour);
        setCooldownMinutes(cfg.cooldown_minutes);
        setRules(rls);
      } catch {
        // Errors are non-fatal — the tab-level fetchers will show errors as needed
      } finally {
        setInitialLoading(false);
        setConfigLoading(false);
        setRulesLoading(false);
      }
    }
    loadInitial();
  }, []);

  // ── Fetch data when tab changes ───────────────────────────

  useEffect(() => {
    if (activeTab === "queue") fetchQueue(queueFilter);
    if (activeTab === "configuration") fetchConfig();
    if (activeTab === "regions") {
      fetchRegions();
      fetchRules();
    }
    if (activeTab === "analytics") fetchAnalytics(analyticsDays);
  }, [activeTab, fetchQueue, fetchConfig, fetchRegions, fetchRules, fetchAnalytics, queueFilter, analyticsDays]);

  // ── Queue Actions ─────────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await api.post(`/api/auto-responder/queue/${id}/approve`);
      toast.success("Response approved and sent");
      fetchQueue(queueFilter);
    } catch {
      toast.error("Failed to approve response");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    try {
      await api.post(`/api/auto-responder/queue/${id}/reject`);
      toast.success("Response rejected");
      fetchQueue(queueFilter);
    } catch {
      toast.error("Failed to reject response");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetry(id: string) {
    setActionLoading(id);
    try {
      await api.post(`/api/auto-responder/queue/${id}/retry`);
      toast.success("Retrying response generation");
      fetchQueue(queueFilter);
    } catch {
      toast.error("Failed to retry");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Config Actions ────────────────────────────────────────

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const payload: Record<string, unknown> = {
        is_enabled: isEnabled,
        ai_model: aiModel,
        tone,
        brand_description: brandDescription || undefined,
        example_phrases: examplePhrases ? examplePhrases.split(",").map((s) => s.trim()).filter(Boolean) : [],
        forbidden_words: forbiddenWords ? forbiddenWords.split(",").map((s) => s.trim()).filter(Boolean) : [],
        signature_template: signatureTemplate || undefined,
        confidence_threshold: confidenceThreshold,
        max_response_length: maxResponseLength,
        escalation_keywords: escalationKeywords ? escalationKeywords.split(",").map((s) => s.trim()).filter(Boolean) : [],
        max_responses_per_hour: maxResponsesPerHour,
        cooldown_minutes: cooldownMinutes,
      };
      const updated = await api.patch<AutoResponderConfig>("/api/auto-responder/config", payload);
      setConfig(updated);
      toast.success("Configuration saved");
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleTestApi() {
    setTestingApi(true);
    try {
      const result = await api.post<{ success: boolean; response_preview?: string; error?: string }>(
        "/api/auto-responder/config/test",
        { api_key: apiKey || undefined }
      );
      if (result.success) {
        toast.success("API connection successful");
        if (result.response_preview) {
          toast.info(`Preview: ${result.response_preview.slice(0, 100)}...`);
        }
      } else {
        toast.error(result.error ?? "API test failed");
      }
    } catch {
      toast.error("Failed to test API connection");
    } finally {
      setTestingApi(false);
    }
  }

  // ── Region Actions ────────────────────────────────────────

  function resetRegionForm() {
    setRegionName("");
    setRegionDescription("");
    setRegionPriority(0);
    setRegionConditions([{ field: "", operator: "eq", value: "" }]);
    setRegionMatchAll(true);
    setRegionToneOverride("");
    setRegionCustomPrompt("");
  }

  async function handleCreateRegion() {
    if (!regionName) return;
    setSavingRegion(true);
    try {
      await api.post<ResponderRegion>("/api/auto-responder/regions", {
        name: regionName,
        description: regionDescription || undefined,
        priority: regionPriority,
        is_active: true,
        conditions: {
          rules: regionConditions.filter((c) => c.field && c.value),
          match_all: regionMatchAll,
        },
        tone_override: regionToneOverride || undefined,
        custom_system_prompt: regionCustomPrompt || undefined,
      });
      toast.success("Region created");
      setRegionDialogOpen(false);
      resetRegionForm();
      fetchRegions();
    } catch {
      toast.error("Failed to create region");
    } finally {
      setSavingRegion(false);
    }
  }

  function openRegionDeleteConfirm(region: ResponderRegion) {
    setDeletingRegion(region);
    setRegionDeleteOpen(true);
  }

  async function handleDeleteRegionConfirm() {
    if (!deletingRegion) return;
    setRegionDeleteLoading(true);
    try {
      await api.delete(`/api/auto-responder/regions/${deletingRegion.id}`);
      toast.success("Region deleted");
      setRegionDeleteOpen(false);
      fetchRegions();
    } catch {
      toast.error("Failed to delete region");
    } finally {
      setRegionDeleteLoading(false);
    }
  }

  async function handleToggleRegion(region: ResponderRegion) {
    try {
      await api.patch<ResponderRegion>(`/api/auto-responder/regions/${region.id}`, {
        is_active: !region.is_active,
      });
      toast.success(`Region ${region.is_active ? "deactivated" : "activated"}`);
      fetchRegions();
    } catch {
      toast.error("Failed to update region");
    }
  }

  // ── Rule Actions ──────────────────────────────────────────

  function resetRuleForm() {
    setRuleName("");
    setRuleAction("auto_respond");
    setRulePriority(0);
    setRuleCampaignId("");
    setRuleRegionId("");
    setRuleDelayMinutes(0);
    setRuleResponseTemplate("");
  }

  async function handleCreateRule() {
    if (!ruleName) return;
    setSavingRule(true);
    try {
      await api.post<ResponderRule>("/api/auto-responder/rules", {
        name: ruleName,
        action: ruleAction,
        priority: rulePriority,
        is_active: true,
        campaign_id: ruleCampaignId || undefined,
        region_id: ruleRegionId || undefined,
        delay_minutes: ruleDelayMinutes,
        response_template: ruleResponseTemplate || undefined,
      });
      toast.success("Rule created");
      setRuleDialogOpen(false);
      resetRuleForm();
      fetchRules();
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setSavingRule(false);
    }
  }

  function openRuleDeleteConfirm(rule: ResponderRule) {
    setDeletingRule(rule);
    setRuleDeleteOpen(true);
  }

  async function handleDeleteRuleConfirm() {
    if (!deletingRule) return;
    setRuleDeleteLoading(true);
    try {
      await api.delete(`/api/auto-responder/rules/${deletingRule.id}`);
      toast.success("Rule deleted");
      setRuleDeleteOpen(false);
      fetchRules();
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setRuleDeleteLoading(false);
    }
  }

  async function handleToggleRule(rule: ResponderRule) {
    try {
      await api.patch<ResponderRule>(`/api/auto-responder/rules/${rule.id}`, {
        is_active: !rule.is_active,
      });
      toast.success(`Rule ${rule.is_active ? "deactivated" : "activated"}`);
      fetchRules();
    } catch {
      toast.error("Failed to update rule");
    }
  }

  // ── Condition Builder Helpers ─────────────────────────────

  function addCondition() {
    setRegionConditions([...regionConditions, { field: "", operator: "eq", value: "" }]);
  }

  function updateCondition(index: number, updates: Partial<RegionConditionRule>) {
    setRegionConditions(
      regionConditions.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
  }

  function removeCondition(index: number) {
    if (regionConditions.length <= 1) return;
    setRegionConditions(regionConditions.filter((_, i) => i !== index));
  }

  // ── Wizard visibility ────────────────────────────────────

  const showWizard =
    !wizardSkipped &&
    !initialLoading &&
    config !== null &&
    config.is_enabled === false &&
    rules.length === 0;

  function handleWizardComplete() {
    setWizardSkipped(true);
    // Re-fetch config and rules so the main UI has fresh data
    fetchConfig();
    fetchRules();
  }

  // ── Render ────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (showWizard) {
    return (
      <div className="p-6">
        <SetupWizard
          onComplete={handleWizardComplete}
          onSkip={() => setWizardSkipped(true)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Auto-Responder</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered automatic email responses with configurable rules and regions
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="queue" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            Queue
          </TabsTrigger>
          <TabsTrigger value="configuration" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="regions" className="gap-1.5">
            <Map className="h-3.5 w-3.5" />
            Regions & Rules
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* ────────────────── QUEUE TAB ────────────────── */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Response Queue</CardTitle>
                  <CardDescription>
                    {queueTotal} total items in queue
                  </CardDescription>
                </div>
                <Select value={queueFilter} onValueChange={(v) => setQueueFilter(v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="responded">Responded</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {queueLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : queueItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No items in queue
                </p>
              ) : (
                <div className="rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8" />
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Lead
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Subject
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Confidence
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Time
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueItems.map((item) => {
                        const isExpanded = expandedRow === item.inbox_message_id;
                        const status = item.responder_status ?? "pending";
                        const showActions = status === "escalated" || status === "pending" || status === "failed";

                        return (
                          <tr key={item.inbox_message_id} className="border-b last:border-b-0 group">
                            <td colSpan={7} className="p-0">
                              <div>
                                <div
                                  className="flex items-center cursor-pointer hover:bg-muted/30 transition-colors"
                                  onClick={() =>
                                    setExpandedRow(isExpanded ? null : item.inbox_message_id)
                                  }
                                >
                                  <div className="px-4 py-2.5 w-8">
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="px-4 py-2.5 flex-1 min-w-0">
                                    <p className="font-medium truncate">
                                      {item.lead_name ?? item.lead_email}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {item.lead_email}
                                    </p>
                                  </div>
                                  <div className="px-4 py-2.5 flex-1 min-w-0">
                                    <p className="truncate">{item.subject}</p>
                                    {item.campaign_name && (
                                      <p className="text-xs text-muted-foreground">
                                        {item.campaign_name}
                                      </p>
                                    )}
                                  </div>
                                  <div className="px-4 py-2.5">
                                    <Badge
                                      variant="secondary"
                                      className={statusColors[status] ?? "bg-gray-100 text-gray-600"}
                                    >
                                      {status}
                                    </Badge>
                                  </div>
                                  <div className="px-4 py-2.5">
                                    {item.confidence_score != null ? (
                                      <span className="font-mono text-xs">
                                        {Math.round(item.confidence_score * 100)}%
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">--</span>
                                    )}
                                  </div>
                                  <div className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                                    {timeAgo(item.received_at)}
                                  </div>
                                  <div
                                    className="px-4 py-2.5 text-right"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {showActions && (
                                      <div className="flex items-center justify-end gap-1">
                                        {(status === "escalated" || status === "pending") && (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleApprove(item.inbox_message_id)}
                                              disabled={actionLoading === item.inbox_message_id}
                                            >
                                              {actionLoading === item.inbox_message_id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              ) : (
                                                <Check className="h-3.5 w-3.5 text-green-600" />
                                              )}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleReject(item.inbox_message_id)}
                                              disabled={actionLoading === item.inbox_message_id}
                                            >
                                              <X className="h-3.5 w-3.5 text-destructive" />
                                            </Button>
                                          </>
                                        )}
                                        {(status === "escalated" || status === "failed") && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRetry(item.inbox_message_id)}
                                            disabled={actionLoading === item.inbox_message_id}
                                          >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Expanded row detail */}
                                {isExpanded && (
                                  <div className="px-12 pb-4 space-y-3 border-t bg-muted/20">
                                    <div className="pt-3">
                                      {item.region_name && (
                                        <p className="text-xs text-muted-foreground mb-2">
                                          Region: <span className="font-medium">{item.region_name}</span>
                                        </p>
                                      )}
                                      {item.body_preview && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">
                                            Incoming Message
                                          </p>
                                          <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap">
                                            {item.body_preview}
                                          </div>
                                        </div>
                                      )}
                                      {item.generated_body && (
                                        <div className="mt-3">
                                          <p className="text-xs font-medium text-muted-foreground mb-1">
                                            Generated Response
                                          </p>
                                          <div className="rounded-md border border-green-200 bg-green-50/50 p-3 text-sm whitespace-pre-wrap">
                                            {item.generated_body}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────── CONFIGURATION TAB ────────────────── */}
        <TabsContent value="configuration">
          {configLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-64 mt-1" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full max-w-md" />
                    <Skeleton className="h-10 w-full max-w-md" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Master toggle */}
              <div className="flex items-center justify-between max-w-2xl rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Auto-Responder</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable or disable automatic AI responses to incoming emails
                  </p>
                </div>
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              </div>

              {/* AI Provider */}
              <Card>
                <CardHeader>
                  <CardTitle>AI Provider</CardTitle>
                  <CardDescription>
                    Configure the AI model used for generating responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="ai-model">Model</Label>
                    <Input
                      id="ai-model"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      placeholder="openai/gpt-4o"
                    />
                    <p className="text-xs text-muted-foreground">
                      Provider and model identifier (e.g. openai/gpt-4o)
                    </p>
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="api-key">API Key</Label>
                    <div className="flex gap-2">
                      <Input
                        id="api-key"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-..."
                      />
                      <Button
                        variant="outline"
                        className="gap-2 shrink-0"
                        onClick={handleTestApi}
                        disabled={testingApi}
                      >
                        {testingApi ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FlaskConical className="h-4 w-4" />
                        )}
                        Test
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your API key is stored securely and never exposed in the UI
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Brand Voice */}
              <Card>
                <CardHeader>
                  <CardTitle>Brand Voice</CardTitle>
                  <CardDescription>
                    Define the tone and personality of AI-generated responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="tone">Tone</Label>
                    <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                      <SelectTrigger id="tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 max-w-lg">
                    <Label htmlFor="brand-desc">Brand Description</Label>
                    <Textarea
                      id="brand-desc"
                      value={brandDescription}
                      onChange={(e) => setBrandDescription(e.target.value)}
                      rows={3}
                      placeholder="Describe your brand personality and communication style..."
                    />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="example-phrases">Example Phrases</Label>
                    <Input
                      id="example-phrases"
                      value={examplePhrases}
                      onChange={(e) => setExamplePhrases(e.target.value)}
                      placeholder="Thanks for reaching out, Happy to help, ..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated phrases the AI should use as reference
                    </p>
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="forbidden-words">Forbidden Words</Label>
                    <Input
                      id="forbidden-words"
                      value={forbiddenWords}
                      onChange={(e) => setForbiddenWords(e.target.value)}
                      placeholder="guarantee, free, discount, ..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated words the AI must never use
                    </p>
                  </div>
                  <div className="space-y-2 max-w-lg">
                    <Label htmlFor="signature">Signature Template</Label>
                    <Textarea
                      id="signature"
                      value={signatureTemplate}
                      onChange={(e) => setSignatureTemplate(e.target.value)}
                      rows={3}
                      placeholder="Best regards,&#10;{{sender_name}}&#10;{{company}}"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Guardrails */}
              <Card>
                <CardHeader>
                  <CardTitle>Guardrails</CardTitle>
                  <CardDescription>
                    Safety thresholds and escalation controls
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="confidence">Confidence Threshold</Label>
                    <Input
                      id="confidence"
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Responses below this confidence (0-1) will be escalated for review
                    </p>
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="max-length">Max Response Length</Label>
                    <Input
                      id="max-length"
                      type="number"
                      min={50}
                      value={maxResponseLength}
                      onChange={(e) => setMaxResponseLength(parseInt(e.target.value) || 500)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum character count for generated responses
                    </p>
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="escalation-kw">Escalation Keywords</Label>
                    <Input
                      id="escalation-kw"
                      value={escalationKeywords}
                      onChange={(e) => setEscalationKeywords(e.target.value)}
                      placeholder="unsubscribe, legal, refund, cancel, ..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated keywords that trigger automatic escalation
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Rate Limits */}
              <Card>
                <CardHeader>
                  <CardTitle>Rate Limits</CardTitle>
                  <CardDescription>
                    Control the volume and frequency of automated responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="max-per-hour">Max Responses Per Hour</Label>
                    <Input
                      id="max-per-hour"
                      type="number"
                      min={1}
                      value={maxResponsesPerHour}
                      onChange={(e) => setMaxResponsesPerHour(parseInt(e.target.value) || 50)}
                    />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="cooldown">Cooldown (minutes)</Label>
                    <Input
                      id="cooldown"
                      type="number"
                      min={0}
                      value={cooldownMinutes}
                      onChange={(e) => setCooldownMinutes(parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum minutes between responses to the same lead
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Save button */}
              <Button
                className="gap-2"
                onClick={handleSaveConfig}
                disabled={savingConfig}
              >
                {savingConfig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ────────────────── REGIONS & RULES TAB ────────────────── */}
        <TabsContent value="regions">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Regions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Regions</h2>
                <Dialog open={regionDialogOpen} onOpenChange={setRegionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => resetRegionForm()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Region
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Add Region</DialogTitle>
                      <DialogDescription>
                        Define a region with matching conditions and behavior overrides
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="space-y-2">
                        <Label htmlFor="region-name">Name</Label>
                        <Input
                          id="region-name"
                          value={regionName}
                          onChange={(e) => setRegionName(e.target.value)}
                          placeholder="e.g. Enterprise Prospects"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="region-desc">Description</Label>
                        <Input
                          id="region-desc"
                          value={regionDescription}
                          onChange={(e) => setRegionDescription(e.target.value)}
                          placeholder="Optional description"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="region-priority">Priority</Label>
                        <Input
                          id="region-priority"
                          type="number"
                          min={0}
                          value={regionPriority}
                          onChange={(e) => setRegionPriority(parseInt(e.target.value) || 0)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Higher priority regions are matched first
                        </p>
                      </div>

                      {/* Conditions builder */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Conditions</Label>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Match</span>
                            <Select
                              value={regionMatchAll ? "all" : "any"}
                              onValueChange={(v) => setRegionMatchAll(v === "all")}
                            >
                              <SelectTrigger className="h-7 w-16 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="any">Any</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {regionConditions.map((cond, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <Input
                                className="flex-1"
                                placeholder="Field"
                                value={cond.field}
                                onChange={(e) => updateCondition(i, { field: e.target.value })}
                              />
                              <Select
                                value={cond.operator}
                                onValueChange={(v) => updateCondition(i, { operator: v as RegionConditionRule["operator"] })}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {operatorOptions.map((op) => (
                                    <SelectItem key={op.value} value={op.value}>
                                      {op.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="flex-1"
                                placeholder="Value"
                                value={typeof cond.value === "string" ? cond.value : cond.value.join(", ")}
                                onChange={(e) => updateCondition(i, { value: e.target.value })}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCondition(i)}
                                disabled={regionConditions.length <= 1}
                              >
                                <X className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={addCondition}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Condition
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="region-tone">Tone Override</Label>
                        <Select
                          value={regionToneOverride || "none"}
                          onValueChange={(v) => setRegionToneOverride(v === "none" ? "" : v)}
                        >
                          <SelectTrigger id="region-tone">
                            <SelectValue placeholder="Use default tone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Use default tone</SelectItem>
                            <SelectItem value="formal">Formal</SelectItem>
                            <SelectItem value="professional">Professional</SelectItem>
                            <SelectItem value="casual">Casual</SelectItem>
                            <SelectItem value="friendly">Friendly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="region-prompt">Custom System Prompt</Label>
                        <Textarea
                          id="region-prompt"
                          value={regionCustomPrompt}
                          onChange={(e) => setRegionCustomPrompt(e.target.value)}
                          rows={3}
                          placeholder="Optional custom instructions for this region..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRegionDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateRegion}
                        disabled={savingRegion || !regionName}
                      >
                        {savingRegion && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Region
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {regionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full" />
                  ))}
                </div>
              ) : regions.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-sm text-muted-foreground text-center">
                      No regions configured yet
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {regions.map((region) => (
                    <Card key={region.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{region.name}</p>
                              <Badge variant="secondary" className="bg-primary/10 text-primary shrink-0">
                                Priority {region.priority}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className={region.is_active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}
                              >
                                {region.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            {region.description && (
                              <p className="text-xs text-muted-foreground">
                                {region.description}
                              </p>
                            )}
                            {region.tone_override && (
                              <p className="text-xs text-muted-foreground">
                                Tone: {region.tone_override}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {region.conditions.rules.length} condition{region.conditions.rules.length !== 1 ? "s" : ""}{" "}
                              ({region.conditions.match_all ? "match all" : "match any"})
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <Switch
                              checked={region.is_active}
                              onCheckedChange={() => handleToggleRegion(region)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRegionDeleteConfirm(region)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Rules */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Rules</h2>
                <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => resetRuleForm()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Rule
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Rule</DialogTitle>
                      <DialogDescription>
                        Define how the auto-responder handles matched emails
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="rule-name">Name</Label>
                        <Input
                          id="rule-name"
                          value={ruleName}
                          onChange={(e) => setRuleName(e.target.value)}
                          placeholder="e.g. Escalate Pricing Questions"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rule-action">Action</Label>
                        <Select
                          value={ruleAction}
                          onValueChange={(v) => setRuleAction(v as typeof ruleAction)}
                        >
                          <SelectTrigger id="rule-action">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto_respond">Auto Respond</SelectItem>
                            <SelectItem value="escalate">Escalate</SelectItem>
                            <SelectItem value="skip">Skip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rule-priority">Priority</Label>
                        <Input
                          id="rule-priority"
                          type="number"
                          min={0}
                          value={rulePriority}
                          onChange={(e) => setRulePriority(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rule-campaign">Campaign ID (optional)</Label>
                        <Input
                          id="rule-campaign"
                          value={ruleCampaignId}
                          onChange={(e) => setRuleCampaignId(e.target.value)}
                          placeholder="Filter to specific campaign"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rule-region">Region</Label>
                        <Select
                          value={ruleRegionId || "none"}
                          onValueChange={(v) => setRuleRegionId(v === "none" ? "" : v)}
                        >
                          <SelectTrigger id="rule-region">
                            <SelectValue placeholder="No region filter" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No region filter</SelectItem>
                            {regions.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rule-delay">Delay (minutes)</Label>
                        <Input
                          id="rule-delay"
                          type="number"
                          min={0}
                          value={ruleDelayMinutes}
                          onChange={(e) => setRuleDelayMinutes(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rule-template">Response Template (optional)</Label>
                        <Textarea
                          id="rule-template"
                          value={ruleResponseTemplate}
                          onChange={(e) => setRuleResponseTemplate(e.target.value)}
                          rows={3}
                          placeholder="Optional template for auto-responses..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateRule}
                        disabled={savingRule || !ruleName}
                      >
                        {savingRule && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Create Rule
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {rulesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : rules.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-sm text-muted-foreground text-center">
                      No rules configured yet
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => {
                    const matchedRegion = regions.find((r) => r.id === rule.region_id);
                    return (
                      <Card key={rule.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{rule.name}</p>
                                <Badge
                                  variant="secondary"
                                  className={actionColors[rule.action] ?? "bg-gray-100 text-gray-600"}
                                >
                                  {rule.action.replace("_", " ")}
                                </Badge>
                                <Badge variant="secondary" className="bg-primary/10 text-primary shrink-0">
                                  Priority {rule.priority}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {rule.campaign_id && (
                                  <span>Campaign: {rule.campaign_id.slice(0, 8)}...</span>
                                )}
                                {matchedRegion && (
                                  <span>Region: {matchedRegion.name}</span>
                                )}
                                {rule.delay_minutes > 0 && (
                                  <span>Delay: {rule.delay_minutes}m</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <Switch
                                checked={rule.is_active}
                                onCheckedChange={() => handleToggleRule(rule)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openRuleDeleteConfirm(rule)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ────────────────── ANALYTICS TAB ────────────────── */}
        <TabsContent value="analytics">
          <div className="space-y-6">
            {/* Days selector */}
            <div className="flex items-center justify-end gap-2">
              {[7, 14, 30].map((d) => (
                <Button
                  key={d}
                  variant={analyticsDays === d ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAnalyticsDays(d)}
                >
                  {d}d
                </Button>
              ))}
            </div>

            {/* Stat cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {analyticsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-28" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                ))
              ) : analytics ? (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Processed
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {analytics.total_processed.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Responded
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-emerald-600">
                        {analytics.total_responded.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Escalated
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-600">
                        {analytics.total_escalated.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Escalation Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {(analytics.escalation_rate * 100).toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>

            {/* Area chart */}
            <Card>
              <CardHeader>
                <CardTitle>Response Activity</CardTitle>
                <CardDescription>
                  Daily breakdown of auto-responder actions over the last {analyticsDays} days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  {analyticsLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : timeSeries.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      No data available for the selected period
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeSeries}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          interval="preserveStartEnd"
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
                        <Area
                          type="monotone"
                          dataKey="responded"
                          stackId="1"
                          stroke="oklch(0.62 0.08 155)"
                          fill="oklch(0.62 0.08 155 / 0.3)"
                          name="Responded"
                        />
                        <Area
                          type="monotone"
                          dataKey="escalated"
                          stackId="1"
                          stroke="oklch(0.72 0.12 75)"
                          fill="oklch(0.72 0.12 75 / 0.3)"
                          name="Escalated"
                        />
                        <Area
                          type="monotone"
                          dataKey="skipped"
                          stackId="1"
                          stroke="oklch(0.65 0.02 60)"
                          fill="oklch(0.65 0.02 60 / 0.3)"
                          name="Skipped"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Region Delete Confirmation */}
      <ConfirmDialog
        open={regionDeleteOpen}
        onOpenChange={setRegionDeleteOpen}
        title="Delete Region"
        description={
          <>
            Are you sure you want to delete the region <span className="font-medium text-foreground">{deletingRegion?.name}</span>? Rules linked to this region will no longer match.
          </>
        }
        confirmLabel="Delete Region"
        loading={regionDeleteLoading}
        onConfirm={handleDeleteRegionConfirm}
      />

      {/* Rule Delete Confirmation */}
      <ConfirmDialog
        open={ruleDeleteOpen}
        onOpenChange={setRuleDeleteOpen}
        title="Delete Rule"
        description={
          <>
            Are you sure you want to delete the rule <span className="font-medium text-foreground">{deletingRule?.name}</span>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Rule"
        loading={ruleDeleteLoading}
        onConfirm={handleDeleteRuleConfirm}
      />
    </div>
  );
}

