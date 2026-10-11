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
import { Checkbox } from "@/components/ui/checkbox";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Settings,
  Shield,
  Users,
  Sparkles,
  Plus,
  Save,
  Trash2,
  Loader2,
  KeyRound,
  Copy,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  WorkspaceSettings,
  TeamMember,
  Suppression,
  PersonalizationSettings,
  DeveloperToken,
  DeveloperTokenCreateResponse,
  DeveloperTokenListResponse,
  DeveloperTokenScope,
} from "@/lib/types";

const timezones = [
  "UTC",
  "Europe/Copenhagen",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const roleConfig: Record<string, { className: string }> = {
  owner: { className: "bg-primary/10 text-primary" },
  admin: { className: "bg-amber-50 text-amber-700" },
  member: { className: "bg-stone-100 text-stone-600" },
};

const developerScopeOptions: { value: DeveloperTokenScope; label: string }[] = [
  { value: "full_access", label: "Full access" },
  { value: "leads:read", label: "Leads read" },
  { value: "leads:write", label: "Leads write" },
  { value: "templates:read", label: "Templates read" },
  { value: "templates:write", label: "Templates write" },
  { value: "campaigns:read", label: "Campaigns read" },
  { value: "campaigns:write", label: "Campaigns write" },
  { value: "campaigns:launch", label: "Campaigns launch" },
  { value: "analytics:read", label: "Analytics read" },
  { value: "compliance:read", label: "Compliance read" },
  { value: "compliance:write", label: "Compliance write" },
  { value: "inbox:read", label: "Inbox read" },
  { value: "inbox:reply", label: "Inbox reply" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const canManageApiTokens = user?.role === "owner" || user?.role === "admin";

  // General settings
  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Compliance settings
  const [unsubscribeText, setUnsubscribeText] = useState("");
  const [gdprEnabled, setGdprEnabled] = useState(true);
  const [canSpamEnabled, setCanSpamEnabled] = useState(true);
  const [savingCompliance, setSavingCompliance] = useState(false);

  // Team
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // Suppression list
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [suppressionEmail, setSuppressionEmail] = useState("");
  const [suppressionReason, setSuppressionReason] = useState("manual");
  const [addingSuppression, setAddingSuppression] = useState(false);

  // AI personalization settings (OpenRouter)
  const [personalizationApiKey, setPersonalizationApiKey] = useState("");
  const [personalizationModelId, setPersonalizationModelId] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeySource, setApiKeySource] = useState<"workspace" | "env" | "none" | string>("none");
  const [modelSource, setModelSource] = useState<"policy" | "default" | string>("default");
  const [savingPersonalization, setSavingPersonalization] = useState(false);
  const [clearingApiKey, setClearingApiKey] = useState(false);

  // Developer API tokens
  const [developerTokens, setDeveloperTokens] = useState<DeveloperToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [createTokenName, setCreateTokenName] = useState("");
  const [createTokenScopes, setCreateTokenScopes] = useState<DeveloperTokenScope[]>([]);
  const [createTokenExpiresAt, setCreateTokenExpiresAt] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdTokenRaw, setCreatedTokenRaw] = useState<string | null>(null);
  const [renameToken, setRenameToken] = useState<DeveloperToken | null>(null);
  const [renameTokenName, setRenameTokenName] = useState("");
  const [renamingToken, setRenamingToken] = useState(false);
  const [revokeToken, setRevokeToken] = useState<DeveloperToken | null>(null);
  const [revokingToken, setRevokingToken] = useState(false);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Fetch workspace settings on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        const settings = await api.get<WorkspaceSettings>(
          "/api/workspace/settings"
        );
        setWorkspaceName(settings.name);
        setTimezone(settings.timezone);
        setUnsubscribeText(settings.unsubscribe_text ?? "");
        setGdprEnabled(settings.gdpr_enabled);
        setCanSpamEnabled(settings.can_spam_enabled);
      } catch {
        toast.error("Failed to load workspace settings");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  // Fetch team members
  const fetchTeam = useCallback(async () => {
    try {
      const members = await api.get<TeamMember[]>("/api/workspace/team");
      setTeamMembers(members);
    } catch {
      toast.error("Failed to load team members");
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Fetch suppression list
  const fetchSuppressions = useCallback(async () => {
    try {
      const data = await api.get<{ items: Suppression[]; total: number }>(
        "/api/compliance/suppression"
      );
      setSuppressions(data.items);
    } catch {
      toast.error("Failed to load suppression list");
    }
  }, []);

  useEffect(() => {
    fetchSuppressions();
  }, [fetchSuppressions]);

  // Fetch personalization settings
  const fetchPersonalization = useCallback(async () => {
    try {
      const settings = await api.get<PersonalizationSettings>(
        "/api/prospecting/personalization/settings"
      );
      setPersonalizationModelId(settings.model_id);
      setApiKeyConfigured(settings.api_key_configured);
      setApiKeySource(settings.api_key_source);
      setModelSource(settings.model_source);
    } catch {
      // Non-critical for workspaces that don't use prospecting/copy personalization yet.
    }
  }, []);

  useEffect(() => {
    fetchPersonalization();
  }, [fetchPersonalization]);

  // Fetch developer API tokens
  const fetchDeveloperTokens = useCallback(async () => {
    if (!canManageApiTokens) {
      setDeveloperTokens([]);
      setTokensLoading(false);
      return;
    }
    setTokensLoading(true);
    try {
      const data = await api.get<DeveloperTokenListResponse>(
        "/api/developer/tokens"
      );
      setDeveloperTokens(data.items);
    } catch {
      toast.error("Failed to load API tokens");
    } finally {
      setTokensLoading(false);
    }
  }, [canManageApiTokens]);

  useEffect(() => {
    fetchDeveloperTokens();
  }, [fetchDeveloperTokens]);

  // Save general settings
  async function handleSaveGeneral() {
    setSavingGeneral(true);
    try {
      await api.patch("/api/workspace/settings", {
        name: workspaceName,
        timezone,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingGeneral(false);
    }
  }

  // Save compliance settings
  async function handleSaveCompliance() {
    setSavingCompliance(true);
    try {
      await api.patch("/api/workspace/settings", {
        unsubscribe_text: unsubscribeText,
        gdpr_enabled: gdprEnabled,
        can_spam_enabled: canSpamEnabled,
      });
      toast.success("Compliance settings saved");
    } catch {
      toast.error("Failed to save compliance settings");
    } finally {
      setSavingCompliance(false);
    }
  }

  // Invite team member
  async function handleInvite() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await api.post("/api/workspace/team/invite", {
        email: inviteEmail,
        full_name: inviteName,
        role: inviteRole,
      });
      toast.success("Team member invited");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("member");
      fetchTeam();
    } catch {
      toast.error("Failed to invite team member");
    } finally {
      setInviting(false);
    }
  }

  // Update team member role
  async function handleRoleChange(memberId: string, newRole: string) {
    try {
      await api.patch(`/api/workspace/team/${memberId}/role`, {
        role: newRole,
      });
      toast.success("Role updated");
      fetchTeam();
    } catch {
      toast.error("Failed to update role");
    }
  }

  // Remove team member
  async function handleRemoveMember(memberId: string) {
    try {
      await api.delete(`/api/workspace/team/${memberId}`);
      toast.success("Team member removed");
      fetchTeam();
    } catch {
      toast.error("Failed to remove team member");
    }
  }

  // Add to suppression list
  async function handleAddSuppression() {
    if (!suppressionEmail) return;
    setAddingSuppression(true);
    try {
      await api.post("/api/compliance/suppression", {
        email: suppressionEmail,
        reason: suppressionReason,
      });
      toast.success("Email added to suppression list");
      setSuppressionEmail("");
      setSuppressionReason("manual");
      fetchSuppressions();
    } catch {
      toast.error("Failed to add to suppression list");
    } finally {
      setAddingSuppression(false);
    }
  }

  // Remove from suppression list
  async function handleRemoveSuppression(id: string) {
    try {
      await api.delete(`/api/compliance/suppression/${id}`);
      toast.success("Removed from suppression list");
      fetchSuppressions();
    } catch {
      toast.error("Failed to remove from suppression list");
    }
  }

  // Save personalization settings
  async function handleSavePersonalization() {
    setSavingPersonalization(true);
    try {
      const payload: Record<string, unknown> = {
        model_id: personalizationModelId.trim(),
      };
      if (personalizationApiKey.trim()) {
        payload.api_key = personalizationApiKey.trim();
      }

      const updated = await api.patch<PersonalizationSettings>(
        "/api/prospecting/personalization/settings",
        payload,
      );

      setApiKeyConfigured(updated.api_key_configured);
      setApiKeySource(updated.api_key_source);
      setModelSource(updated.model_source);
      setPersonalizationApiKey("");
      toast.success("Personalization settings saved");
    } catch {
      toast.error("Failed to save personalization settings");
    } finally {
      setSavingPersonalization(false);
    }
  }

  async function handleClearWorkspaceApiKey() {
    setClearingApiKey(true);
    try {
      const updated = await api.patch<PersonalizationSettings>(
        "/api/prospecting/personalization/settings",
        { clear_api_key: true },
      );
      setApiKeyConfigured(updated.api_key_configured);
      setApiKeySource(updated.api_key_source);
      setModelSource(updated.model_source);
      setPersonalizationApiKey("");
      toast.success("Workspace API key cleared");
    } catch {
      toast.error("Failed to clear workspace API key");
    } finally {
      setClearingApiKey(false);
    }
  }

  function handleCreateTokenOpenChange(open: boolean) {
    setCreateTokenOpen(open);
    if (!open) {
      setCreateTokenName("");
      setCreateTokenScopes([]);
      setCreateTokenExpiresAt("");
      setCreatedTokenRaw(null);
    }
  }

  function toggleCreateTokenScope(scope: DeveloperTokenScope) {
    setCreateTokenScopes((current) => {
      if (scope === "full_access") {
        return current.includes("full_access") ? [] : ["full_access"];
      }

      const withoutFullAccess = current.filter((s) => s !== "full_access");
      return withoutFullAccess.includes(scope)
        ? withoutFullAccess.filter((s) => s !== scope)
        : [...withoutFullAccess, scope];
    });
  }

  async function handleCreateDeveloperToken() {
    const name = createTokenName.trim();
    if (!name || createTokenScopes.length === 0) return;

    setCreatingToken(true);
    try {
      const payload: {
        name: string;
        scopes: DeveloperTokenScope[];
        expires_at?: string;
      } = {
        name,
        scopes: createTokenScopes,
      };

      if (createTokenExpiresAt) {
        payload.expires_at = new Date(
          `${createTokenExpiresAt}T23:59:59`
        ).toISOString();
      }

      const created = await api.post<DeveloperTokenCreateResponse>(
        "/api/developer/tokens",
        payload
      );
      setCreatedTokenRaw(created.token);
      await fetchDeveloperTokens();
      toast.success("API token created");
    } catch {
      toast.error("Failed to create API token");
    } finally {
      setCreatingToken(false);
    }
  }

  async function copyCreatedToken() {
    if (!createdTokenRaw) return;
    try {
      await navigator.clipboard.writeText(createdTokenRaw);
      toast.success("Token copied");
    } catch {
      toast.error("Failed to copy token");
    }
  }

  function openRenameTokenDialog(token: DeveloperToken) {
    setRenameToken(token);
    setRenameTokenName(token.name);
  }

  async function handleRenameDeveloperToken() {
    if (!renameToken || !renameTokenName.trim()) return;

    setRenamingToken(true);
    try {
      await api.patch<DeveloperToken>(`/api/developer/tokens/${renameToken.id}`, {
        name: renameTokenName.trim(),
      });
      setRenameToken(null);
      setRenameTokenName("");
      await fetchDeveloperTokens();
      toast.success("API token renamed");
    } catch {
      toast.error("Failed to rename API token");
    } finally {
      setRenamingToken(false);
    }
  }

  async function handleRevokeDeveloperToken() {
    if (!revokeToken) return;

    setRevokingToken(true);
    try {
      await api.delete<DeveloperToken>(`/api/developer/tokens/${revokeToken.id}`);
      setRevokeToken(null);
      await fetchDeveloperTokens();
      toast.success("API token revoked");
    } catch {
      toast.error("Failed to revoke API token");
    } finally {
      setRevokingToken(false);
    }
  }

  function formatTokenDate(value: string | null) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  }

  function getTokenStatus(token: DeveloperToken) {
    if (token.revoked_at) {
      return {
        label: "Revoked",
        className: "bg-red-50 text-red-700",
      };
    }
    if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) {
      return {
        label: "Expired",
        className: "bg-amber-50 text-amber-700",
      };
    }
    if (!token.is_active) {
      return {
        label: "Disabled",
        className: "bg-stone-100 text-stone-600",
      };
    }
    return {
      label: "Active",
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your workspace configuration
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI Personalization
          </TabsTrigger>
          <TabsTrigger value="developer" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            API Access
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Team
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure your workspace name and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2 max-w-md">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This is your workspace display name
                </p>
              </div>
              <div className="space-y-2 max-w-md">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for scheduling campaigns and analytics
                </p>
              </div>
              <Button
                className="gap-2"
                onClick={handleSaveGeneral}
                disabled={savingGeneral}
              >
                {savingGeneral ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Personalization Tab */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>Lead Personalization</CardTitle>
              <CardDescription>
                Configure the OpenRouter API key and model for copy/personalization generation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2 max-w-2xl">
                <Label htmlFor="openrouter-model-id">OpenRouter Model ID</Label>
                <Input
                  id="openrouter-model-id"
                  value={personalizationModelId}
                  onChange={(e) => setPersonalizationModelId(e.target.value)}
                  placeholder="anthropic/claude-4.5-sonnet"
                />
                <p className="text-xs text-muted-foreground">
                  Use an OpenRouter model ID (for example: <code>openai/gpt-4o-mini</code>).
                  Current source: <strong>{modelSource}</strong>.
                </p>
              </div>

              <div className="space-y-2 max-w-2xl">
                <Label htmlFor="openrouter-api-key">OpenRouter API Key</Label>
                <Input
                  id="openrouter-api-key"
                  type="password"
                  value={personalizationApiKey}
                  onChange={(e) => setPersonalizationApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep existing key. Key configured:{" "}
                  <strong>{apiKeyConfigured ? "yes" : "no"}</strong> (source:{" "}
                  <strong>{apiKeySource}</strong>).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  className="gap-2"
                  onClick={handleSavePersonalization}
                  disabled={savingPersonalization || !personalizationModelId.trim()}
                >
                  {savingPersonalization ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Personalization Settings
                </Button>

                {apiKeySource === "workspace" && (
                  <Button
                    variant="outline"
                    onClick={handleClearWorkspaceApiKey}
                    disabled={clearingApiKey}
                  >
                    {clearingApiKey && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Clear Workspace Key
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Access Tab */}
        <TabsContent value="developer">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>API Tokens</CardTitle>
                  <CardDescription>
                    Create and revoke workspace tokens for external integrations.
                  </CardDescription>
                </div>
                {canManageApiTokens && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchDeveloperTokens}
                      disabled={tokensLoading}
                    >
                      {tokensLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Dialog
                      open={createTokenOpen}
                      onOpenChange={handleCreateTokenOpenChange}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Token
                        </Button>
                      </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Create API Token</DialogTitle>
                        <DialogDescription>
                          The full token is shown once after creation.
                        </DialogDescription>
                      </DialogHeader>

                      {createdTokenRaw ? (
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="created-token">Token</Label>
                            <div className="flex gap-2">
                              <Input
                                id="created-token"
                                value={createdTokenRaw}
                                readOnly
                                className="font-mono text-xs"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={copyCreatedToken}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Store this token now. It cannot be viewed again.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-5 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="token-name">Name</Label>
                            <Input
                              id="token-name"
                              value={createTokenName}
                              onChange={(e) => setCreateTokenName(e.target.value)}
                              placeholder="Production integration"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="token-expiry">Expiration</Label>
                            <Input
                              id="token-expiry"
                              type="date"
                              value={createTokenExpiresAt}
                              onChange={(e) =>
                                setCreateTokenExpiresAt(e.target.value)
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Leave blank for no expiration.
                            </p>
                          </div>

                          <div className="space-y-3">
                            <Label>Scopes</Label>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {developerScopeOptions.map((scope) => {
                                const fullAccessSelected =
                                  createTokenScopes.includes("full_access");
                                return (
                                  <label
                                    key={scope.value}
                                    className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                                  >
                                    <Checkbox
                                      checked={createTokenScopes.includes(
                                        scope.value
                                      )}
                                      disabled={
                                        fullAccessSelected &&
                                        scope.value !== "full_access"
                                      }
                                      onCheckedChange={() =>
                                        toggleCreateTokenScope(scope.value)
                                      }
                                    />
                                    <span>{scope.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      <DialogFooter>
                        {createdTokenRaw ? (
                          <Button
                            onClick={() => handleCreateTokenOpenChange(false)}
                          >
                            Done
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => handleCreateTokenOpenChange(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleCreateDeveloperToken}
                              disabled={
                                creatingToken ||
                                !createTokenName.trim() ||
                                createTokenScopes.length === 0
                              }
                            >
                              {creatingToken && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              )}
                              Create Token
                            </Button>
                          </>
                        )}
                      </DialogFooter>
                    </DialogContent>
                    </Dialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!canManageApiTokens ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Only workspace owners and admins can manage API tokens.
                </p>
              ) : tokensLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : developerTokens.length > 0 ? (
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Prefix
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Scopes
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Last Used
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          Expires
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {developerTokens.map((token) => {
                        const status = getTokenStatus(token);
                        const canRevoke = !token.revoked_at && token.is_active;

                        return (
                          <tr
                            key={token.id}
                            className="border-b last:border-b-0"
                          >
                            <td className="px-4 py-2.5 font-medium">
                              {token.name}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs">
                              {token.token_prefix}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex max-w-sm flex-wrap gap-1">
                                {token.scopes.map((scope) => (
                                  <Badge
                                    key={scope}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {scope}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant="secondary"
                                className={status.className}
                              >
                                {status.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              <div>{formatTokenDate(token.last_used_at)}</div>
                              {token.last_used_ip && (
                                <div className="text-xs">
                                  {token.last_used_ip}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {formatTokenDate(token.expires_at)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openRenameTokenDialog(token)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRevokeToken(token)}
                                  disabled={!canRevoke}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No API tokens yet
                </p>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={!!renameToken}
            onOpenChange={(open) => {
              if (!open) {
                setRenameToken(null);
                setRenameTokenName("");
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename API Token</DialogTitle>
                <DialogDescription>
                  Update the display name for this token.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <Label htmlFor="rename-token-name">Name</Label>
                <Input
                  id="rename-token-name"
                  value={renameTokenName}
                  onChange={(e) => setRenameTokenName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleRenameDeveloperToken();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRenameToken(null);
                    setRenameTokenName("");
                  }}
                  disabled={renamingToken}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRenameDeveloperToken}
                  disabled={renamingToken || !renameTokenName.trim()}
                >
                  {renamingToken && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Compliance Settings</CardTitle>
                <CardDescription>
                  Manage email compliance and legal requirements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-lg">
                  <Label htmlFor="unsub-text">Unsubscribe Text</Label>
                  <Textarea
                    id="unsub-text"
                    value={unsubscribeText}
                    onChange={(e) => setUnsubscribeText(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Appended to all outgoing emails. Use{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {"{{unsubscribe_link}}"}
                    </code>{" "}
                    for the link
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between max-w-lg rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        GDPR Compliance
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Track consent and honor data deletion requests
                      </p>
                    </div>
                    <Switch
                      checked={gdprEnabled}
                      onCheckedChange={setGdprEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between max-w-lg rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">
                        CAN-SPAM Notice
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Include physical address and identification in emails
                      </p>
                    </div>
                    <Switch
                      checked={canSpamEnabled}
                      onCheckedChange={setCanSpamEnabled}
                    />
                  </div>
                </div>

                <Button
                  className="gap-2"
                  onClick={handleSaveCompliance}
                  disabled={savingCompliance}
                >
                  {savingCompliance ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            {/* Suppression List */}
            <Card>
              <CardHeader>
                <CardTitle>Suppression List</CardTitle>
                <CardDescription>
                  Emails on this list will never receive outgoing messages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add to suppression form */}
                <div className="flex items-end gap-3 max-w-lg">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="suppression-email">Email</Label>
                    <Input
                      id="suppression-email"
                      type="email"
                      placeholder="email@example.com"
                      value={suppressionEmail}
                      onChange={(e) => setSuppressionEmail(e.target.value)}
                    />
                  </div>
                  <div className="w-36 space-y-2">
                    <Label htmlFor="suppression-reason">Reason</Label>
                    <Select
                      value={suppressionReason}
                      onValueChange={setSuppressionReason}
                    >
                      <SelectTrigger id="suppression-reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="bounce">Bounce</SelectItem>
                        <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                        <SelectItem value="complaint">Complaint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleAddSuppression}
                    disabled={addingSuppression || !suppressionEmail}
                  >
                    {addingSuppression ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Suppression table */}
                {suppressions.length > 0 ? (
                  <div className="rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Email
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Reason
                          </th>
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                            Date Added
                          </th>
                          <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {suppressions.map((s) => (
                          <tr key={s.id} className="border-b last:border-b-0">
                            <td className="px-4 py-2.5 font-mono text-xs">
                              {s.email}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="secondary" className="text-xs">
                                {s.reason}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {new Date(s.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveSuppression(s.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No suppressed emails yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>
                    Manage who has access to this workspace
                  </CardDescription>
                </div>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Invite Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                      <DialogDescription>
                        Send an invitation to join your workspace
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email">Email Address</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="colleague@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-name">Full Name</Label>
                        <Input
                          id="invite-name"
                          placeholder="Jane Smith"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={setInviteRole}
                        >
                          <SelectTrigger id="invite-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setInviteOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleInvite}
                        disabled={inviting || !inviteEmail}
                      >
                        {inviting && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Send Invitation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {teamMembers.map((member) => {
                  const isSelf = user?.id === member.id;
                  const rc =
                    roleConfig[member.role] || roleConfig.member;
                  const initials = getInitials(member.full_name);

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                          {initials}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {member.full_name}
                            {isSelf && (
                              <span className="text-xs text-muted-foreground ml-2">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isSelf && member.role !== "owner" ? (
                          <>
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                handleRoleChange(member.id, value)
                              }
                            >
                              <SelectTrigger className="w-28 h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="member">Member</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <Badge
                            variant="secondary"
                            className={rc.className}
                          >
                            {member.role.charAt(0).toUpperCase() +
                              member.role.slice(1)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}

                {teamMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No team members found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!revokeToken}
        onOpenChange={(open) => {
          if (!open) setRevokeToken(null);
        }}
        title="Revoke API Token"
        description={
          <p className="text-sm text-muted-foreground">
            Revoke <strong>{revokeToken?.name}</strong>? Requests using this
            token will stop working immediately.
          </p>
        }
        confirmLabel="Revoke Token"
        loading={revokingToken}
        onConfirm={handleRevokeDeveloperToken}
      />
    </div>
  );
}

