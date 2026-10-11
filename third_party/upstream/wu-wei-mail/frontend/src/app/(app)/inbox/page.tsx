"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Inbox,
  Reply,
  ArrowLeft,
  Send,
  Loader2,
  Search,
  Filter,
  ExternalLink,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { InboxThread, InboxMessage, Account, WorkflowListItem } from "@/lib/types";
import { toast } from "sonner";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter & search state
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "replies">("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Accounts cache for resolving account_email -> account_id
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Workflow lookup: campaign_id -> workflow info
  const [campaignWorkflows, setCampaignWorkflows] = useState<
    Record<string, { workflow_id: string; workflow_name: string }>
  >({});

  const load = useCallback(() => {
    api
      .get<InboxThread[]>("/api/inbox/threads")
      .then(setThreads)
      .catch(() => toast.error("Failed to load inbox threads"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Fetch accounts once for resolving account_email -> account_id
  useEffect(() => {
    api
      .get<Account[]>("/api/accounts")
      .then(setAccounts)
      .catch(() => {});
  }, []);

  // Fetch workflow list for mapping campaign_id -> workflow
  useEffect(() => {
    api
      .get<WorkflowListItem[]>("/api/workflows")
      .then((workflows) => {
        const map: Record<string, { workflow_id: string; workflow_name: string }> = {};
        for (const wf of workflows) {
          if (wf.campaign_id) {
            map[wf.campaign_id] = {
              workflow_id: wf.id,
              workflow_name: wf.name,
            };
          }
        }
        setCampaignWorkflows(map);
      })
      .catch(() => {});
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Client-side filtering: filter + search
  const filteredThreads = useMemo(() => {
    let result = threads;

    // Apply tab filter
    if (activeFilter === "unread") {
      result = result.filter((t) => !t.is_read);
    } else if (activeFilter === "replies") {
      result = result.filter((t) => t.message_count > 1);
    }

    // Apply search filter
    const q = searchDebounced.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.lead_email.toLowerCase().includes(q)
      );
    }

    return result;
  }, [threads, activeFilter, searchDebounced]);

  const unreadCount = threads.filter((t) => !t.is_read).length;

  // Keyboard shortcuts: j/k navigate, r focuses reply, Escape deselects
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const currentIndex = selectedThread
          ? filteredThreads.findIndex(
              (t) => t.thread_id === selectedThread.thread_id
            )
          : -1;
        let nextIndex: number;
        if (e.key === "j") {
          nextIndex =
            currentIndex < filteredThreads.length - 1 ? currentIndex + 1 : currentIndex;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }
        if (filteredThreads[nextIndex]) {
          selectThread(filteredThreads[nextIndex]);
        }
      }

      if (e.key === "r" && selectedThread) {
        e.preventDefault();
        replyRef.current?.focus();
      }

      if (e.key === "Escape" && selectedThread) {
        setSelectedThread(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedThread, filteredThreads]);

  async function selectThread(thread: InboxThread) {
    setSelectedThread({ ...thread, messages: thread.messages ?? [] });
    setReplyText("");

    try {
      const detail = await api.get<InboxThread>(`/api/inbox/threads/${thread.thread_id}`);
      setSelectedThread(detail);
    } catch {
      toast.error("Failed to load thread messages");
    }

    if (!thread.is_read) {
      await api.post(`/api/inbox/threads/${thread.thread_id}/read`).catch(() => {});
      setThreads((prev) =>
        prev.map((t) =>
          t.thread_id === thread.thread_id ? { ...t, is_read: true } : t
        )
      );
    }
  }

  async function handleSendReply() {
    if (!selectedThread) return;
    if (!replyText.trim()) {
      toast.error("Please enter a reply message");
      return;
    }

    // Find the matching account by email
    const matchedAccount = accounts.find(
      (a) => a.email === selectedThread.account_email
    );

    if (!matchedAccount) {
      toast.error(
        "Could not find a matching sending account for this thread"
      );
      return;
    }

    try {
      setSending(true);
      await api.post("/api/inbox/reply", {
        to_email: selectedThread.lead_email,
        account_id: matchedAccount.id,
        subject: `Re: ${selectedThread.subject}`,
        body: replyText,
        thread_id: selectedThread.thread_id,
      });

      // Add the reply to the local thread messages for immediate display
      const newMessage: InboxMessage = {
        id: `local-${Date.now()}`,
        workspace_id: matchedAccount.workspace_id,
        account_id: matchedAccount.id,
        from_email: matchedAccount.email,
        to_email: selectedThread.lead_email,
        subject: `Re: ${selectedThread.subject}`,
        body_text: replyText,
        direction: "outbound",
        is_read: true,
        is_auto_reply: false,
        thread_id: selectedThread.thread_id,
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const updatedThread: InboxThread = {
        ...selectedThread,
        messages: [...selectedThread.messages, newMessage],
        message_count: selectedThread.message_count + 1,
        last_message_at: new Date().toISOString(),
      };

      setSelectedThread(updatedThread);
      setThreads((prev) =>
        prev.map((t) =>
          t.thread_id === selectedThread.thread_id ? updatedThread : t
        )
      );
      setReplyText("");
      toast.success("Reply sent successfully");
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount} unread {unreadCount === 1 ? "message" : "messages"} | {threads.length} total
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["all", "unread", "replies"] as const).map((filter) => (
          <Button
            key={filter}
            variant={activeFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(filter)}
            className="capitalize"
          >
            {filter === "all"
              ? "All"
              : filter === "unread"
              ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`
              : "Replies"}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-[600px]">
        {/* Thread List */}
        <Card
          className={cn(
            "lg:col-span-2 overflow-hidden",
            selectedThread && "hidden lg:block"
          )}
        >
          <CardContent className="p-0">
            {/* Search Input */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by subject or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="divide-y max-h-[calc(100vh-280px)] overflow-y-auto">
                {filteredThreads.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Inbox className="h-10 w-10 mb-3" />
                    <p className="text-sm">
                      {threads.length === 0
                        ? "No messages yet"
                        : "No threads match your filters"}
                    </p>
                  </div>
                )}
                {filteredThreads.map((thread) => {
                  // Build a snippet from the last message or fallback
                  const lastMsg =
                    thread.messages && thread.messages.length > 0
                      ? thread.messages[thread.messages.length - 1]
                      : null;
                  const snippet = lastMsg?.body_text
                    ? lastMsg.body_text.slice(0, 80) +
                      (lastMsg.body_text.length > 80 ? "..." : "")
                    : "Click to view messages";

                  return (
                    <button
                      key={thread.thread_id}
                      onClick={() => selectThread(thread)}
                      className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                        selectedThread?.thread_id === thread.thread_id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1.5">
                          {!thread.is_read ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                          ) : (
                            <div className="h-2.5 w-2.5 rounded-full bg-transparent" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm truncate ${
                                !thread.is_read ? "font-semibold" : "font-medium"
                              }`}
                            >
                              {thread.lead_email}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {timeAgo(thread.last_message_at)}
                            </span>
                          </div>
                          <p
                            className={`text-sm truncate mt-0.5 ${
                              !thread.is_read ? "font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {thread.subject}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {snippet}
                          </p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {thread.message_count} {thread.message_count === 1 ? "message" : "messages"}
                            </Badge>
                            {/* Show workflow badge if thread is linked to a workflow */}
                            {(() => {
                              const cid = thread.messages?.find(
                                (m) => m.campaign_id,
                              )?.campaign_id;
                              const wf = cid ? campaignWorkflows[cid] : null;
                              if (!wf) return null;
                              return (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-600"
                                >
                                  <Workflow className="h-2.5 w-2.5 mr-0.5" />
                                  {wf.workflow_name}
                                </Badge>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thread View */}
        <Card
          className={cn(
            "lg:col-span-3 flex flex-col",
            !selectedThread && "hidden lg:flex"
          )}
        >
          {selectedThread ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden h-8 w-8"
                      onClick={() => setSelectedThread(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                      <CardTitle className="text-lg">
                        {selectedThread.subject}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Link
                          href={`/leads?search=${encodeURIComponent(selectedThread.lead_email)}`}
                          className="text-sm text-muted-foreground hover:text-primary hover:underline transition-colors"
                        >
                          {selectedThread.lead_email}
                        </Link>
                        <Link
                          href={`/leads?search=${encodeURIComponent(selectedThread.lead_email)}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Lead
                        </Link>
                        {/* Workflow context badge */}
                        {(() => {
                          const campaignId = selectedThread.messages.find(
                            (m) => m.campaign_id,
                          )?.campaign_id;
                          const wfInfo = campaignId
                            ? campaignWorkflows[campaignId]
                            : null;
                          if (!wfInfo && !campaignId) return null;
                          return (
                            <>
                              {campaignId && (
                                <Link
                                  href={`/campaigns/${campaignId}`}
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Campaign
                                </Link>
                              )}
                              {wfInfo && (
                                <Link
                                  href={`/campaigns/${campaignId}/workflow`}
                                  className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-full px-2 py-0.5 transition-colors"
                                >
                                  <Workflow className="h-3 w-3" />
                                  {wfInfo.workflow_name}
                                </Link>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {/* Messages */}
                <div className="space-y-4 flex-1">
                  {selectedThread.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-4 ${
                        msg.direction === "outbound"
                          ? "bg-muted/40 border-muted"
                          : "bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
                              msg.direction === "outbound"
                                ? "bg-primary/10 text-primary"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {msg.direction === "outbound" && msg.is_auto_reply ? "AI" : msg.direction === "outbound" ? "Me" : msg.from_email.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">
                            {msg.direction === "outbound" && msg.is_auto_reply ? "AI Auto-Response" : msg.direction === "outbound" ? "You" : msg.from_email}
                          </span>
                          {msg.is_auto_reply && msg.direction === "outbound" && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">AI</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(msg.received_at)}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-line leading-relaxed pl-9">
                        {msg.body_text ?? ""}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply Area */}
                <div className="mt-6 border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Reply className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Reply</span>
                  </div>
                  <Textarea
                    ref={replyRef}
                    placeholder="Write your reply..."
                    rows={4}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={sending}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSendReply}
                      disabled={sending || !replyText.trim()}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      {sending ? "Sending..." : "Send Reply"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
              <Inbox className="h-12 w-12 mb-4" />
              <p className="text-base font-medium">Select a message</p>
              <p className="text-sm mt-1">
                Choose a conversation from the list to view the thread
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

