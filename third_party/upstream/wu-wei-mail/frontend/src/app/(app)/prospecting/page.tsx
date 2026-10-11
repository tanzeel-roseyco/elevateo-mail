"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, getAccessToken } from "@/lib/api";
import { toast } from "sonner";
import {
  ProspectingConversation,
  ProspectingMessage,
  ProspectingAction,
  ProspectingLead,
  CopyVariant,
  CopyDraftResponse,
  CampaignActionResponse,
  LeadImportResponse,
  LeadList,
  Template,
} from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import ReactMarkdown from "react-markdown";
import {
  Compass,
  Send,
  Plus,
  Loader2,
  MessageSquare,
  Search,
  Megaphone,
  Rocket,
  ChevronRight,
  CheckCircle2,
  Import,
  Pencil,
  Copy,
  Zap,
  BookmarkPlus,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Stage configuration
// ---------------------------------------------------------------------------

const STAGE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; description: string }
> = {
  DISCOVERY: {
    label: "Discovery",
    icon: Search,
    color: "text-primary",
    description: "Finding leads matching your ICP",
  },
  SELECTION: {
    label: "Selection",
    icon: CheckCircle2,
    color: "text-amber-600",
    description: "Review and select discovered leads",
  },
  COPYWRITING: {
    label: "Copywriting",
    icon: Pencil,
    color: "text-violet-500",
    description: "Drafting outreach copy",
  },
  CAMPAIGN_SETUP: {
    label: "Campaign Setup",
    icon: Megaphone,
    color: "text-emerald-600",
    description: "Configure campaign settings",
  },
  LAUNCH_READY: {
    label: "Launch Ready",
    icon: Rocket,
    color: "text-primary",
    description: "Review and launch your campaign",
  },
  LAUNCHED: {
    label: "Launched",
    icon: Zap,
    color: "text-emerald-600",
    description: "Campaign is live",
  },
};

const STAGE_ORDER = [
  "DISCOVERY",
  "SELECTION",
  "COPYWRITING",
  "CAMPAIGN_SETUP",
  "LAUNCH_READY",
  "LAUNCHED",
];

// ---------------------------------------------------------------------------
// Main Prospecting Page
// ---------------------------------------------------------------------------

export default function ProspectingPage() {
  // Conversation list
  const [conversations, setConversations] = useState<ProspectingConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<ProspectingConversation | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);

  // Messages
  const [messages, setMessages] = useState<ProspectingMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Copy draft dialog
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTone, setCopyTone] = useState("professional");
  const [copyVariants, setCopyVariants] = useState(2);
  const [copySegment, setCopySegment] = useState("");
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [draftResult, setDraftResult] = useState<CopyDraftResponse | null>(null);

  // Campaign creation dialog
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const targetType = "native"; // Instantly integration not yet available
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
  const [launchingCampaign, setLaunchingCampaign] = useState(false);

  // Lead import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importListName, setImportListName] = useState("");
  const [importing, setImporting] = useState(false);
  const [prospectingLeads, setProspectingLeads] = useState<ProspectingLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Lead table dialog (read-only view)
  const [showLeadTable, setShowLeadTable] = useState(false);

  // New conversation dialog
  const [showNewConvDialog, setShowNewConvDialog] = useState(false);
  const [newConvTitle, setNewConvTitle] = useState("");
  const [creatingConv, setCreatingConv] = useState(false);

  // Lead lists for import
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");

  // Save as template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Cold Outreach");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ─── Data fetching ────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.get<ProspectingConversation[]>(
        "/api/prospecting/conversations"
      );
      setConversations(convs);
    } catch {
      toast.error("Failed to load conversations");
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true);
    try {
      const msgs = await api.get<ProspectingMessage[]>(
        `/api/prospecting/conversations/${convId}/messages`
      );
      setMessages(msgs);
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadProspectingLeads = useCallback(async (convId: string) => {
    try {
      const leads = await api.get<ProspectingLead[]>(
        `/api/prospecting/conversations/${convId}/leads`
      );
      setProspectingLeads(leads);
      // Auto-select all non-excluded leads
      setSelectedLeadIds(new Set(leads.filter(l => !l.is_excluded).map(l => l.id)));
    } catch {
      // Non-critical — may not have leads yet
      setProspectingLeads([]);
    }
  }, []);

  const loadLeadLists = useCallback(async () => {
    try {
      const lists = await api.get<LeadList[]>("/api/leads/lists/all");
      setLeadLists(lists);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadLeadLists();
  }, [loadConversations, loadLeadLists]);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id);
      // Recover campaign_id from conversation metadata
      const meta = selectedConv.metadata_json as Record<string, unknown> | null;
      if (meta?.campaign_id && typeof meta.campaign_id === "string") {
        setCreatedCampaignId(meta.campaign_id);
      } else {
        setCreatedCampaignId(null);
      }
    }
  }, [selectedConv, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Conversation management ──────────────────────────────

  async function createConversation() {
    setCreatingConv(true);
    try {
      const conv = await api.post<ProspectingConversation>(
        "/api/prospecting/conversations",
        { title: newConvTitle || undefined }
      );
      setConversations((prev) => [conv, ...prev]);
      setSelectedConv(conv);
      setShowNewConvDialog(false);
      setNewConvTitle("");
      toast.success("Conversation created");
    } catch {
      toast.error("Failed to create conversation");
    } finally {
      setCreatingConv(false);
    }
  }

  // ─── Send message (SSE streaming) ────────────────────────

  async function sendMessage() {
    if (!selectedConv || !messageInput.trim()) return;
    setSending(true);

    // Optimistic user message
    const optimisticMsg: ProspectingMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConv.id,
      role: "user",
      content: messageInput.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    const input = messageInput.trim();
    setMessageInput("");

    // Add a placeholder assistant message that we'll fill incrementally
    const streamMsgId = `stream-${Date.now()}`;
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== optimisticMsg.id),
      { ...optimisticMsg, id: `user-${Date.now()}` },
      {
        id: streamMsgId,
        conversation_id: selectedConv.id,
        role: "assistant" as const,
        content: "",
        created_at: new Date().toISOString(),
        metadata_json: { streaming: true },
      },
    ]);

    try {
      const token = getAccessToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const response = await fetch(
        `${baseUrl}/api/prospecting/conversations/${selectedConv.id}/messages/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content: input }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";
      let currentEvent = ""; // Track the event type across chunks

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from the buffer
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trimEnd();
          buffer = buffer.slice(newlineIdx + 1);

          if (line === "") {
            // Empty line = end of event block, reset
            currentEvent = "";
            continue;
          }

          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (line.startsWith("data: ")) {
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            const eventType = currentEvent || "status";

            if (eventType === "token") {
              assistantContent += (data.text as string) || "";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId ? { ...m, content: assistantContent } : m
                )
              );
            } else if (eventType === "status") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? { ...m, content: assistantContent || `_${data.message}_` }
                    : m
                )
              );
            } else if (eventType === "tool_call") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? {
                        ...m,
                        content: assistantContent || `Calling ${data.tool}...`,
                        metadata_json: { streaming: true, tool_call: data.tool },
                      }
                    : m
                )
              );
            } else if (eventType === "tool_result") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? {
                        ...m,
                        content: assistantContent || `${data.tool}: ${data.summary}`,
                      }
                    : m
                )
              );
            } else if (eventType === "done") {
              const finalContent = (data.content as string) || assistantContent;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMsgId
                    ? {
                        ...m,
                        content: finalContent,
                        metadata_json: {
                          ...((m.metadata_json as Record<string, unknown>) || {}),
                          streaming: false,
                          has_leads: data.has_leads === true,
                          stage_transition: data.stage_transition,
                          stage_prompt: data.stage_prompt,
                        },
                      }
                    : m
                )
              );

              if (data.stage_transition && selectedConv) {
                setSelectedConv({
                  ...selectedConv,
                  stage: data.stage_transition as ProspectingConversation["stage"],
                });
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === selectedConv.id
                      ? {
                          ...c,
                          stage: data.stage_transition as ProspectingConversation["stage"],
                        }
                      : c
                  )
                );
              }
            } else if (eventType === "error") {
              toast.error(`Agent error: ${data.error}`);
            }
          }
        }
      }
    } catch {
      toast.error("Failed to send message");
      // Remove streaming placeholder and revert
      setMessages((prev) =>
        prev.filter((m) => m.id !== streamMsgId && m.id !== optimisticMsg.id)
      );
      setMessageInput(input);
    } finally {
      setSending(false);
    }
  }

  // ─── Copy draft generation ────────────────────────────────

  async function generateCopyDraft() {
    if (!selectedConv) return;
    setGeneratingCopy(true);
    try {
      const result = await api.post<CopyDraftResponse>(
        "/api/prospecting/copy/draft",
        {
          conversation_id: selectedConv.id,
          segment_description: copySegment || undefined,
          tone: copyTone,
          num_variants: copyVariants,
        }
      );
      setDraftResult(result);
      toast.success(`Generated ${result.variants.length} copy variants`);
    } catch {
      toast.error("Failed to generate copy draft");
    } finally {
      setGeneratingCopy(false);
    }
  }

  // ─── Campaign creation ────────────────────────────────────

  async function createCampaign() {
    if (!selectedConv || !campaignName.trim() || !selectedListId) return;
    setCreatingCampaign(true);
    try {
      const variants: CopyVariant[] = draftResult?.variants || [
        { subject: "Hello {{first_name}}", body: "I noticed..." },
      ];
      const result = await api.post<CampaignActionResponse>(
        "/api/prospecting/campaigns/create",
        {
          conversation_id: selectedConv.id,
          campaign_name: campaignName,
          lead_list_id: selectedListId,
          copy_variants: variants,
          target_type: targetType,
        }
      );
      setShowCampaignDialog(false);
      setCampaignName("");
      if (result.campaign_id) {
        setCreatedCampaignId(result.campaign_id);
      }
      toast.success(
        `Campaign created (${result.launch_status}) via ${result.target_type}`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to create campaign";
      toast.error(detail);
    } finally {
      setCreatingCampaign(false);
    }
  }

  async function launchCampaign() {
    if (!selectedConv || !createdCampaignId) {
      toast.error("No campaign to launch. Create a campaign first.");
      return;
    }
    setLaunchingCampaign(true);
    try {
      // Step 1: Create campaign_launch action
      const actionParams = new URLSearchParams({
        conversation_id: selectedConv.id,
        action_type: "campaign_launch",
      });
      const action = await api.post<{ id: string }>(
        `/api/prospecting/actions?${actionParams}`
      );

      // Step 2: Approve the action
      await api.post(
        `/api/prospecting/actions/${action.id}/approve`,
        { approved: true }
      );

      // Step 3: Launch the campaign
      const launchParams = new URLSearchParams({
        conversation_id: selectedConv.id,
        campaign_id: createdCampaignId,
      });
      const result = await api.post<CampaignActionResponse>(
        `/api/prospecting/campaigns/launch?${launchParams}`
      );
      toast.success(`Campaign launched (${result.launch_status})`);

      // Refresh conversation to get updated stage
      const updated = await api.get<ProspectingConversation>(
        `/api/prospecting/conversations/${selectedConv.id}`
      );
      setSelectedConv(updated);
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to launch campaign";
      toast.error(detail);
    } finally {
      setLaunchingCampaign(false);
    }
  }

  // ─── Lead import ──────────────────────────────────────────

  function openImportDialog() {
    if (selectedConv) {
      loadProspectingLeads(selectedConv.id);
    }
    setShowImportDialog(true);
  }

  function openLeadTable() {
    if (selectedConv) {
      loadProspectingLeads(selectedConv.id);
    }
    setShowLeadTable(true);
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleAllLeads() {
    const eligible = prospectingLeads.filter(l => !l.is_excluded);
    if (selectedLeadIds.size === eligible.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(eligible.map(l => l.id)));
    }
  }

  async function importLeads() {
    if (!selectedConv) return;
    if (selectedLeadIds.size === 0) {
      toast.error("Select at least one lead to import");
      return;
    }
    setImporting(true);
    try {
      // 1. Create bulk_import action
      const actionParams = new URLSearchParams({
        conversation_id: selectedConv.id,
        action_type: "bulk_import",
      });
      const action = await api.post<ProspectingAction>(
        `/api/prospecting/actions?${actionParams}`
      );
      // 2. Approve the action
      await api.post(`/api/prospecting/actions/${action.id}/approve`, {
        approved: true,
      });
      // 3. Import with action_id
      const result = await api.post<LeadImportResponse>(
        "/api/prospecting/leads/import",
        {
          lead_ids: Array.from(selectedLeadIds),
          target_list_id: selectedListId || undefined,
          new_list_name: importListName || undefined,
          action_id: action.id,
        }
      );
      setShowImportDialog(false);
      toast.success(
        `Imported ${result.imported_count} leads (${result.duplicate_count} duplicates)`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to import leads";
      toast.error(detail);
    } finally {
      setImporting(false);
    }
  }

  // ─── Save as template ────────────────────────────────────

  function openSaveAsTemplate(variant: CopyVariant) {
    const label = variant.variant_label || "Untitled";
    setTemplateName(`Prospecting Template - ${label}`);
    setTemplateSubject(variant.subject);
    setTemplateBody(variant.body);
    setTemplateCategory("Cold Outreach");
    setShowTemplateDialog(true);
  }

  async function saveAsTemplate() {
    if (!templateName.trim() || !templateSubject.trim()) return;
    setSavingTemplate(true);
    try {
      await api.post<Template>("/api/templates", {
        name: templateName.trim(),
        subject: templateSubject.trim(),
        body: templateBody.trim(),
        category: templateCategory,
      });
      toast.success("Template saved!");
      setShowTemplateDialog(false);
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────

  function renderStageProgress() {
    if (!selectedConv) return null;
    const currentIdx = STAGE_ORDER.indexOf(selectedConv.stage);

    return (
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STAGE_ORDER.map((stage, idx) => {
          const config = STAGE_CONFIG[stage];
          const Icon = config.icon;
          const isActive = stage === selectedConv.stage;
          const isCompleted = idx < currentIdx;

          return (
            <div key={stage} className="flex items-center">
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                    ? "bg-muted text-foreground"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{config.label}</span>
              </div>
              {idx < STAGE_ORDER.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 mx-0.5 text-muted-foreground/50" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderMessage(msg: ProspectingMessage) {
    const isUser = msg.role === "user";
    const meta = msg.metadata_json as Record<string, unknown> | undefined;
    const isStreaming = meta?.streaming === true;
    const hasLeads = meta?.has_leads === true;
    const stagePrompt = meta?.stage_prompt as
      | { prompt_text: string; suggested_actions: string[] }
      | undefined;

    return (
      <div
        key={msg.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`max-w-[80%] rounded-lg border p-3 ${
            isUser
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/40 border-muted"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {!isUser && msg.agent_type && (
              <Badge variant="secondary" className="text-[10px]">
                {msg.agent_type}
              </Badge>
            )}
            <span className="text-[10px] opacity-60">
              {new Date(msg.created_at).toLocaleTimeString()}
            </span>
          </div>
          {isUser ? (
            <div className="text-sm whitespace-pre-line leading-relaxed">
              {msg.content}
            </div>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
          {/* View Leads button for assistant messages with lead data */}
          {!isUser && !isStreaming && hasLeads && (
            <div className="mt-2 pt-2 border-t border-current/10">
              <Button
                variant="outline"
                size="sm"
                onClick={openLeadTable}
                className="h-7 text-xs"
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                View Leads
              </Button>
            </div>
          )}
          {stagePrompt && (
            <div className="mt-2 pt-2 border-t border-current/10">
              <p className="text-xs opacity-75 mb-1">{stagePrompt.prompt_text}</p>
              <div className="flex flex-wrap gap-1">
                {stagePrompt.suggested_actions.map((action, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] cursor-pointer hover:bg-background/50"
                    onClick={() => setMessageInput(action)}
                  >
                    {action}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderActionButtons() {
    if (!selectedConv) return null;
    const stage = selectedConv.stage;

    return (
      <div className="flex flex-wrap gap-2">
        {(stage === "SELECTION" || stage === "DISCOVERY") && (
          <Button
            variant="outline"
            size="sm"
            onClick={openImportDialog}
          >
            <Import className="h-3.5 w-3.5 mr-1.5" />
            Import Leads
          </Button>
        )}
        {(stage === "COPYWRITING" || stage === "SELECTION") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCopyDialog(true)}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Generate Copy
          </Button>
        )}
        {(stage === "CAMPAIGN_SETUP" || stage === "COPYWRITING") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCampaignDialog(true)}
          >
            <Megaphone className="h-3.5 w-3.5 mr-1.5" />
            Create Campaign
          </Button>
        )}
        {stage === "LAUNCH_READY" && (
          <Button
            variant="default"
            size="sm"
            onClick={launchCampaign}
            disabled={launchingCampaign || !createdCampaignId}
          >
            {launchingCampaign ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
            )}
            {launchingCampaign ? "Launching..." : "Launch Campaign"}
          </Button>
        )}
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Conversation list sidebar */}
      <div className="w-72 border-r flex flex-col">
        <div className="p-3 border-b">
          <Button
            className="w-full"
            size="sm"
            onClick={() => setShowNewConvDialog(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Compass className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Create one to start prospecting</p>
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((conv) => {
                const stageConf = STAGE_CONFIG[conv.stage] || STAGE_CONFIG.DISCOVERY;
                const StageIcon = stageConf.icon;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                      selectedConv?.id === conv.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <StageIcon className={`h-3.5 w-3.5 ${stageConf.color}`} />
                      <span className="text-sm font-medium truncate">
                        {conv.title || "Untitled"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {stageConf.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(conv.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main conversation area */}
      <div className="flex-1 flex flex-col">
        {selectedConv ? (
          <>
            {/* Stage progress bar */}
            <div className="px-4 py-3 border-b">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">
                  {selectedConv.title || "Untitled Conversation"}
                </h2>
                <Badge variant="outline" className="text-[10px]">
                  {STAGE_CONFIG[selectedConv.stage]?.description}
                </Badge>
              </div>
              {renderStageProgress()}
            </div>

            {/* Action buttons bar */}
            <div className="px-4 py-2 border-b bg-muted/20">
              {renderActionButtons()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-3/4" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Start the conversation</p>
                    <p className="text-xs mt-1">
                      Describe your ideal customer profile to begin
                    </p>
                  </div>
                </div>
              ) : (
                messages.map(renderMessage)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t p-3">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Describe your ICP, ask for leads, or request copy..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                />
                <Button
                  onClick={sendMessage}
                  disabled={sending || !messageInput.trim()}
                  size="icon"
                  className="shrink-0"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Compass className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <h2 className="text-lg font-medium mb-1">Prospecting Agent</h2>
              <p className="text-sm max-w-md">
                Create a conversation to start discovering leads, generating
                outreach copy, and building campaigns — all through a guided
                agent flow.
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowNewConvDialog(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Conversation
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────── */}

      {/* New Conversation */}
      <Dialog open={showNewConvDialog} onOpenChange={setShowNewConvDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Prospecting Conversation</DialogTitle>
            <DialogDescription>
              Start a new agent-guided prospecting session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title (optional)</Label>
              <Input
                placeholder="e.g., Q1 Healthcare Outreach"
                value={newConvTitle}
                onChange={(e) => setNewConvTitle(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewConvDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={createConversation} disabled={creatingConv}>
              {creatingConv && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Draft Generation */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Copy Draft</DialogTitle>
            <DialogDescription>
              Create outreach copy variants for your leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Segment Description</Label>
              <Input
                placeholder="e.g., CFOs in fintech startups"
                value={copySegment}
                onChange={(e) => setCopySegment(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tone</Label>
                <Select value={copyTone} onValueChange={setCopyTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="bold">Bold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Variants</Label>
                <Select
                  value={String(copyVariants)}
                  onValueChange={(v) => setCopyVariants(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} variant{n > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Draft results */}
            {draftResult && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {draftResult.variants.map((v, i) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {v.variant_label || `Variant ${i + 1}`}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openSaveAsTemplate(v)}
                        >
                          <BookmarkPlus className="h-3.5 w-3.5 mr-1" />
                          Save as Template
                        </Button>
                      </div>
                      <p className="text-sm font-medium">{v.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                        {v.body}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCopyDialog(false);
                setDraftResult(null);
              }}
            >
              Close
            </Button>
            <Button onClick={generateCopyDraft} disabled={generatingCopy}>
              {generatingCopy && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              {draftResult ? "Regenerate" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Creation with Launch Target Choice */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>
              Build a campaign from your prospecting conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Campaign Name</Label>
              <Input
                placeholder="e.g., Q1 Healthcare Outreach"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div>
              <Label>Lead List</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list..." />
                </SelectTrigger>
                <SelectContent>
                  {leadLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.member_count} leads)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedListId && (
                <p className="text-xs text-destructive mt-1">
                  A lead list is required to create a campaign. Import leads first.
                </p>
              )}
            </div>

            {/* Launch target — native only (Instantly integration is not yet available) */}
            <div>
              <Label>Launch Target</Label>
              <div className="mt-1.5">
                <div className="rounded-lg border border-primary bg-primary/5 p-3 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Megaphone className="h-4 w-4" />
                    <span className="text-sm font-medium">Native</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Send via Wu Wei Mail accounts
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCampaignDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={createCampaign}
              disabled={creatingCampaign || !campaignName.trim() || !selectedListId}
            >
              {creatingCampaign && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Import */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Leads</DialogTitle>
            <DialogDescription>
              Select leads to import into your CRM lead lists.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Lead selection table */}
            {prospectingLeads.length > 0 && (
              <div className="border rounded-md max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left w-8">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.size === prospectingLeads.filter(l => !l.is_excluded).length && selectedLeadIds.size > 0}
                          onChange={toggleAllLeads}
                          className="rounded"
                        />
                      </th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Company</th>
                      <th className="p-2 text-left">Title</th>
                      <th className="p-2 text-left">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prospectingLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={`border-t ${lead.is_excluded ? "opacity-40" : "hover:bg-muted/30 cursor-pointer"}`}
                        onClick={() => !lead.is_excluded && toggleLeadSelection(lead.id)}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.has(lead.id)}
                            disabled={lead.is_excluded}
                            onChange={() => toggleLeadSelection(lead.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="p-2 font-medium">{lead.first_name} {lead.last_name}</td>
                        <td className="p-2 text-muted-foreground">{lead.company}</td>
                        <td className="p-2 text-muted-foreground">{lead.title}</td>
                        <td className="p-2">
                          <Badge variant={lead.readiness_band === "READY_HIGH_CONFIDENCE" ? "default" : "secondary"}>
                            {lead.quality_score ? `${Math.round(lead.quality_score * 100)}%` : "N/A"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {prospectingLeads.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No leads discovered yet. Run a discovery first.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedLeadIds.size} of {prospectingLeads.filter(l => !l.is_excluded).length} leads selected
            </p>

            {/* Target list selection */}
            <div>
              <Label>Existing List</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a list..." />
                </SelectTrigger>
                <SelectContent>
                  {leadLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.member_count} leads)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>or</span>
            </div>
            <div>
              <Label>New List Name</Label>
              <Input
                placeholder="e.g., Healthcare CFOs - Q1"
                value={importListName}
                onChange={(e) => setImportListName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowImportDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={importLeads} disabled={importing || selectedLeadIds.size === 0}>
              {importing && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Import {selectedLeadIds.size} Leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Leads Table (read-only) */}
      <Dialog open={showLeadTable} onOpenChange={setShowLeadTable}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Discovered Leads</DialogTitle>
            <DialogDescription>
              {prospectingLeads.length > 0
                ? `${prospectingLeads.filter(l => !l.is_excluded).length} active leads (${prospectingLeads.filter(l => l.is_excluded).length} excluded)`
                : "No leads discovered yet."}
            </DialogDescription>
          </DialogHeader>
          {prospectingLeads.length > 0 ? (
            <div className="border rounded-md max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Company</th>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Source</th>
                    <th className="p-2 text-left">Score</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prospectingLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className={`border-t ${lead.is_excluded ? "opacity-40" : "hover:bg-muted/30"}`}
                    >
                      <td className="p-2 font-medium whitespace-nowrap">
                        {lead.first_name} {lead.last_name}
                      </td>
                      <td className="p-2 text-muted-foreground">{lead.company || "—"}</td>
                      <td className="p-2 text-muted-foreground">{lead.title || "—"}</td>
                      <td className="p-2 text-muted-foreground text-xs">{lead.email || "—"}</td>
                      <td className="p-2">
                        {lead.source_name && (
                          <Badge variant="secondary" className="text-[10px]">
                            {lead.source_name}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <Badge variant={lead.readiness_band === "READY_HIGH_CONFIDENCE" ? "default" : "secondary"}>
                          {lead.quality_score ? `${Math.round(lead.quality_score * 100)}%` : "N/A"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {lead.is_excluded ? (
                          <Badge variant="destructive" className="text-[10px]">Excluded</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Active</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No leads discovered yet. Ask the agent to search for prospects first.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeadTable(false)}>
              Close
            </Button>
            {prospectingLeads.filter(l => !l.is_excluded).length > 0 && (
              <Button onClick={() => { setShowLeadTable(false); openImportDialog(); }}>
                <Import className="h-3.5 w-3.5 mr-1.5" />
                Import Leads
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save this copy variant to your template library for reuse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                placeholder="e.g., Cold Outreach - Professional"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={templateCategory} onValueChange={setTemplateCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cold Outreach">Cold Outreach</SelectItem>
                  <SelectItem value="Follow Up">Follow Up</SelectItem>
                  <SelectItem value="Event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input
                placeholder="Email subject line"
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                placeholder="Email body content"
                value={templateBody}
                onChange={(e) => setTemplateBody(e.target.value)}
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveAsTemplate}
              disabled={savingTemplate || !templateName.trim() || !templateSubject.trim()}
            >
              {savingTemplate && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
