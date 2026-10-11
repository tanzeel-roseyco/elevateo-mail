"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  CheckCircle,
  XCircle,
  Mail,
  Send,
  Shield,
  Flame,
  RefreshCw,
  Settings,
  Loader2,
  Plug,
  Pencil,
  Trash2,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  Account,
  AccountProvider,
  ConnectionTestResponse,
  DNSCheckResponse,
  OAuthProvidersResponse,
  WarmupAccountStatus,
} from "@/lib/types";
import { accountStatus } from "@/lib/types";
import { toast } from "sonner";

// ---------- Provider config ----------
const providerConfig: Record<
  AccountProvider,
  { label: string; icon: string; badge: string; badgeClass: string }
> = {
  google: {
    label: "Google Workspace",
    icon: "\u{1F535}",
    badge: "Connected via Google",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  microsoft: {
    label: "Microsoft 365",
    icon: "\u{1F7E0}",
    badge: "Connected via Microsoft",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
  },
  manual: {
    label: "Manual SMTP",
    icon: "\u2699\uFE0F",
    badge: "Manual Setup",
    badgeClass: "bg-stone-50 text-stone-600 border-stone-200",
  },
};

const statusConfig: Record<
  "connected" | "warming" | "error" | "disconnected",
  { label: string; className: string }
> = {
  connected: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-700",
  },
  warming: {
    label: "Warming Up",
    className: "bg-amber-100 text-amber-700",
  },
  error: {
    label: "Error",
    className: "bg-red-100 text-red-700",
  },
  disconnected: {
    label: "Paused",
    className: "bg-stone-100 text-stone-600",
  },
};

function healthColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function healthTextColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

const warmupPhaseConfig: Record<string, { label: string; className: string }> = {
  enrolling: { label: "Enrolling", className: "bg-blue-100 text-blue-700" },
  ramping: { label: "Ramping", className: "bg-amber-100 text-amber-700" },
  steady: { label: "Steady", className: "bg-emerald-100 text-emerald-700" },
  graduating: { label: "Graduating", className: "bg-teal-100 text-teal-700" },
  graduated: { label: "Graduated", className: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Paused", className: "bg-stone-100 text-stone-600" },
  error: { label: "Error", className: "bg-red-100 text-red-700" },
};

const OAUTH_FALLBACK: OAuthProvidersResponse = {
  google: { enabled: true },
  microsoft: { enabled: false },
};

// ---------- Google SVG Logo ----------
function GoogleLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ---------- Microsoft SVG Logo ----------
function MicrosoftLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

// ---------- Loading Skeleton ----------
function AccountCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Skeleton className="h-5 w-36 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- SMTP Form initial state ----------
interface SmtpFormData {
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: string;
}

const initialSmtpForm: SmtpFormData = {
  email: "",
  displayName: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUsername: "",
  smtpPassword: "",
  imapHost: "",
  imapPort: "993",
};

// ---------- Edit Form state ----------
interface EditFormData {
  displayName: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: string;
  dailyLimit: string;
}

// ---------- Main Page ----------
export default function AccountsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [smtpForm, setSmtpForm] = useState<SmtpFormData>(initialSmtpForm);
  const [submitting, setSubmitting] = useState(false);

  // DNS verification loading state (keyed by account id)
  const [verifyingDns, setVerifyingDns] = useState<Record<string, boolean>>({});

  // Connection test loading state (keyed by account id)
  const [testingConnection, setTestingConnection] = useState<Record<string, boolean>>({});

  // Warmup status (keyed by account id) — lazily fetched for enrolled accounts
  const [warmupStatuses, setWarmupStatuses] = useState<Record<string, WarmupAccountStatus>>({});
  const [oauthProviders, setOauthProviders] = useState<OAuthProvidersResponse>(OAUTH_FALLBACK);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState<EditFormData>({
    displayName: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUsername: "",
    smtpPassword: "",
    imapHost: "",
    imapPort: "993",
    dailyLimit: "50",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Fetch accounts from API
  useEffect(() => {
    let cancelled = false;
    async function fetchAccounts() {
      try {
        setLoading(true);
        const [data, providers] = await Promise.all([
          api.get<Account[]>("/api/accounts"),
          api
            .get<OAuthProvidersResponse>("/api/oauth/providers")
            .catch(() => OAUTH_FALLBACK),
        ]);
        if (!cancelled) {
          setAccounts(data);
          setOauthProviders(providers);
          // Lazily fetch warmup status for accounts that have warmup enabled
          for (const acct of data) {
            if (acct.warmup_enabled) {
              api
                .get<WarmupAccountStatus>(`/api/warmup/accounts/${acct.id}/status`)
                .then((ws) => {
                  if (!cancelled) {
                    setWarmupStatuses((prev) => ({ ...prev, [acct.id]: ws }));
                  }
                })
                .catch(() => {}); // silently ignore (warmup may be disabled)
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error("Failed to load accounts");
          console.error("Failed to fetch accounts:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle OAuth callback success
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected === "google" || connected === "microsoft") {
      const label = connected === "google" ? "Google" : "Microsoft";
      setSuccessMessage(`${label} account connected successfully!`);
      toast.success(`${label} account connected successfully!`);
      // Remove the query param from URL
      router.replace("/accounts", { scroll: false });
      // Re-fetch accounts to include the newly connected one
      api.get<Account[]>("/api/accounts").then(setAccounts).catch(console.error);
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  function isOAuthProviderEnabled(provider: "google" | "microsoft"): boolean {
    if (provider === "google") return oauthProviders.google.enabled;
    return oauthProviders.microsoft.enabled;
  }

  async function handleOAuthRedirect(provider: "google" | "microsoft") {
    if (!isOAuthProviderEnabled(provider)) {
      toast.error(`${provider === "google" ? "Google" : "Microsoft"} OAuth is not configured`);
      return;
    }
    try {
      const data = await api.get<{ auth_url: string }>(`/api/oauth/${provider}/authorize`);
      window.location.href = data.auth_url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to start ${provider} connection`;
      toast.error(message);
    }
  }

  function handleSmtpFormChange(field: keyof SmtpFormData, value: string) {
    setSmtpForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSmtpSubmit() {
    if (!smtpForm.email) {
      toast.error("Email address is required");
      return;
    }
    if (!smtpForm.smtpHost) {
      toast.error("SMTP host is required");
      return;
    }

    setSubmitting(true);
    try {
      const newAccount = await api.post<Account>("/api/accounts", {
        email: smtpForm.email,
        display_name: smtpForm.displayName || undefined,
        smtp_host: smtpForm.smtpHost,
        smtp_port: parseInt(smtpForm.smtpPort, 10) || 587,
        smtp_username: smtpForm.smtpUsername || undefined,
        smtp_password: smtpForm.smtpPassword || undefined,
        smtp_use_tls: true,
        imap_host: smtpForm.imapHost || undefined,
        imap_port: parseInt(smtpForm.imapPort, 10) || 993,
        daily_limit: 50,
        warmup_enabled: true,
      });
      setAccounts((prev) => [...prev, newAccount]);
      setSmtpForm(initialSmtpForm);
      setSmtpOpen(false);
      toast.success("Account connected successfully!");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect account";
      toast.error(message);
      console.error("Failed to create account:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyDns(accountId: string) {
    setVerifyingDns((prev) => ({ ...prev, [accountId]: true }));
    try {
      const result = await api.post<DNSCheckResponse>(
        `/api/accounts/${accountId}/verify-dns`
      );

      // Update the account's DNS fields based on the response
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? {
                ...a,
                spf_verified: !!result.spf?.valid,
                dkim_verified: !!result.dkim?.valid,
                dmarc_verified: !!result.dmarc?.valid,
              }
            : a
        )
      );

      if (result.overall_healthy) {
        toast.success(`DNS verification passed for ${result.email}`);
      } else {
        const failing: string[] = [];
        if (!result.spf?.valid) failing.push("SPF");
        if (!result.dkim?.valid) failing.push("DKIM");
        if (!result.dmarc?.valid) failing.push("DMARC");
        toast.warning(
          `DNS issues found for ${result.email}: ${failing.join(", ")} not verified`
        );
      }
    } catch {
      toast.error("Failed to verify DNS records");
    } finally {
      setVerifyingDns((prev) => ({ ...prev, [accountId]: false }));
    }
  }

  async function handleTestConnection(accountId: string) {
    setTestingConnection((prev) => ({ ...prev, [accountId]: true }));
    try {
      const result = await api.post<ConnectionTestResponse>(
        `/api/accounts/${accountId}/test-connection`
      );
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTestingConnection((prev) => ({ ...prev, [accountId]: false }));
    }
  }

  function openEditDialog(account: Account) {
    setEditingAccount(account);
    setEditForm({
      displayName: account.display_name || "",
      smtpHost: account.smtp_host || "",
      smtpPort: String(account.smtp_port),
      smtpUsername: "",
      smtpPassword: "",
      imapHost: account.imap_host || "",
      imapPort: String(account.imap_port),
      dailyLimit: String(account.daily_limit),
    });
    setEditOpen(true);
  }

  function handleEditFormChange(field: keyof EditFormData, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleEditSubmit() {
    if (!editingAccount) return;

    setEditSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.displayName !== (editingAccount.display_name || ""))
        payload.display_name = editForm.displayName || null;
      if (editForm.smtpHost !== (editingAccount.smtp_host || ""))
        payload.smtp_host = editForm.smtpHost || null;
      if (editForm.smtpPort !== String(editingAccount.smtp_port))
        payload.smtp_port = parseInt(editForm.smtpPort, 10) || 587;
      if (editForm.smtpUsername) payload.smtp_username = editForm.smtpUsername;
      if (editForm.smtpPassword) payload.smtp_password = editForm.smtpPassword;
      if (editForm.imapHost !== (editingAccount.imap_host || ""))
        payload.imap_host = editForm.imapHost || null;
      if (editForm.imapPort !== String(editingAccount.imap_port))
        payload.imap_port = parseInt(editForm.imapPort, 10) || 993;
      if (editForm.dailyLimit !== String(editingAccount.daily_limit))
        payload.daily_limit = parseInt(editForm.dailyLimit, 10) || 50;

      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
        setEditOpen(false);
        return;
      }

      const updated = await api.patch<Account>(
        `/api/accounts/${editingAccount.id}`,
        payload
      );
      setAccounts((prev) =>
        prev.map((a) => (a.id === editingAccount.id ? updated : a))
      );
      setEditOpen(false);
      toast.success("Account updated successfully");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update account";
      toast.error(message);
    } finally {
      setEditSubmitting(false);
    }
  }

  function openDeleteDialog(account: Account) {
    setDeletingAccount(account);
    setDeleteOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingAccount) return;

    setDeleteSubmitting(true);
    try {
      await api.delete(`/api/accounts/${deletingAccount.id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== deletingAccount.id));
      setDeleteOpen(false);
      toast.success(`Account ${deletingAccount.email} deleted`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete account";
      toast.error(message);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Success toast */}
      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-4 text-emerald-600 hover:text-emerald-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Loading accounts..." : `${accounts.length} sending accounts configured`}
          </p>
        </div>

        {/* Add Account -- Connection Wizard */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Connect Email Account</DialogTitle>
              <DialogDescription>
                Choose a provider to connect your email account for sending
                campaigns.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 sm:grid-cols-3">
              {/* Google */}
              {oauthProviders.google.enabled && (
                <Card className="cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group">
                  <CardContent className="flex flex-col items-center text-center gap-3 pt-6 pb-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 group-hover:bg-blue-100 transition-colors">
                      <GoogleLogo className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Google</p>
                      <p className="text-xs text-muted-foreground">
                        Gmail & Google Workspace
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-1"
                      onClick={() => handleOAuthRedirect("google")}
                    >
                      Connect with Google
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Microsoft */}
              {oauthProviders.microsoft.enabled && (
                <Card className="cursor-pointer hover:border-orange-400 hover:shadow-md transition-all group">
                  <CardContent className="flex flex-col items-center text-center gap-3 pt-6 pb-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-50 group-hover:bg-orange-100 transition-colors">
                      <MicrosoftLogo className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Microsoft</p>
                      <p className="text-xs text-muted-foreground">
                        Outlook & Office 365
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => handleOAuthRedirect("microsoft")}
                    >
                      Connect with Microsoft
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Manual */}
              <Card className="cursor-pointer hover:border-stone-400 hover:shadow-md transition-all group">
                <CardContent className="flex flex-col items-center text-center gap-3 pt-6 pb-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-stone-100 group-hover:bg-stone-200 transition-colors">
                    <Settings className="h-7 w-7 text-stone-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Manual Setup</p>
                    <p className="text-xs text-muted-foreground">
                      Other email providers
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-1"
                    onClick={() => {
                      setAddOpen(false);
                      setTimeout(() => setSmtpOpen(true), 150);
                    }}
                  >
                    Manual SMTP/IMAP
                  </Button>
                </CardContent>
              </Card>
            </div>

            {oauthProviders.google.enabled && !oauthProviders.microsoft.enabled && (
              <p className="text-xs text-muted-foreground">
                Google OAuth is enabled. Microsoft OAuth is currently disabled in backend configuration.
              </p>
            )}
          </DialogContent>
        </Dialog>

        {/* Manual SMTP Dialog (separate, opened from wizard) */}
        <Dialog open={smtpOpen} onOpenChange={setSmtpOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Manual SMTP/IMAP Setup</DialogTitle>
              <DialogDescription>
                Enter your email server credentials to connect manually.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    placeholder="you@company.com"
                    value={smtpForm.email}
                    onChange={(e) => handleSmtpFormChange("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="John Doe"
                    value={smtpForm.displayName}
                    onChange={(e) => handleSmtpFormChange("displayName", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpHost">SMTP Host</Label>
                  <Input
                    id="smtpHost"
                    placeholder="smtp.gmail.com"
                    value={smtpForm.smtpHost}
                    onChange={(e) => handleSmtpFormChange("smtpHost", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort">SMTP Port</Label>
                  <Input
                    id="smtpPort"
                    placeholder="587"
                    value={smtpForm.smtpPort}
                    onChange={(e) => handleSmtpFormChange("smtpPort", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpUser">SMTP Username</Label>
                  <Input
                    id="smtpUser"
                    placeholder="username"
                    value={smtpForm.smtpUsername}
                    onChange={(e) => handleSmtpFormChange("smtpUsername", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPass">SMTP Password</Label>
                  <Input
                    id="smtpPass"
                    type="password"
                    placeholder="••••••••"
                    value={smtpForm.smtpPassword}
                    onChange={(e) => handleSmtpFormChange("smtpPassword", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imapHost">IMAP Host</Label>
                  <Input
                    id="imapHost"
                    placeholder="imap.gmail.com"
                    value={smtpForm.imapHost}
                    onChange={(e) => handleSmtpFormChange("imapHost", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imapPort">IMAP Port</Label>
                  <Input
                    id="imapPort"
                    placeholder="993"
                    value={smtpForm.imapPort}
                    onChange={(e) => handleSmtpFormChange("imapPort", e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSmtpOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSmtpSubmit} disabled={submitting}>
                {submitting ? "Connecting..." : "Connect Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Account Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Account</DialogTitle>
              <DialogDescription>
                Update settings for {editingAccount?.email}. Leave password fields blank to keep existing credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-displayName">Display Name</Label>
                  <Input
                    id="edit-displayName"
                    placeholder="John Doe"
                    value={editForm.displayName}
                    onChange={(e) => handleEditFormChange("displayName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dailyLimit">Daily Limit</Label>
                  <Input
                    id="edit-dailyLimit"
                    type="number"
                    placeholder="50"
                    value={editForm.dailyLimit}
                    onChange={(e) => handleEditFormChange("dailyLimit", e.target.value)}
                  />
                </div>
              </div>
              {editingAccount?.provider === "manual" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-smtpHost">SMTP Host</Label>
                      <Input
                        id="edit-smtpHost"
                        placeholder="smtp.gmail.com"
                        value={editForm.smtpHost}
                        onChange={(e) => handleEditFormChange("smtpHost", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-smtpPort">SMTP Port</Label>
                      <Input
                        id="edit-smtpPort"
                        placeholder="587"
                        value={editForm.smtpPort}
                        onChange={(e) => handleEditFormChange("smtpPort", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-smtpUser">SMTP Username</Label>
                      <Input
                        id="edit-smtpUser"
                        placeholder="Leave blank to keep current"
                        value={editForm.smtpUsername}
                        onChange={(e) => handleEditFormChange("smtpUsername", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-smtpPass">SMTP Password</Label>
                      <Input
                        id="edit-smtpPass"
                        type="password"
                        placeholder="Leave blank to keep current"
                        value={editForm.smtpPassword}
                        onChange={(e) => handleEditFormChange("smtpPassword", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-imapHost">IMAP Host</Label>
                      <Input
                        id="edit-imapHost"
                        placeholder="imap.gmail.com"
                        value={editForm.imapHost}
                        onChange={(e) => handleEditFormChange("imapHost", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-imapPort">IMAP Port</Label>
                      <Input
                        id="edit-imapPort"
                        placeholder="993"
                        value={editForm.imapPort}
                        onChange={(e) => handleEditFormChange("imapPort", e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleEditSubmit} disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete Account"
          description={
            <>
              Are you sure you want to delete <span className="font-medium text-foreground">{deletingAccount?.email}</span>? This action cannot be undone. Any campaigns using this account will no longer be able to send.
            </>
          }
          confirmLabel="Delete Account"
          loading={deleteSubmitting}
          onConfirm={handleDeleteConfirm}
        />
      </div>

      {/* Account Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <>
            <AccountCardSkeleton />
            <AccountCardSkeleton />
            <AccountCardSkeleton />
          </>
        ) : accounts.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3 border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-medium">No sending accounts connected</p>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Connect a mailbox to start warming up your sender reputation and launching campaigns.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Account
                </Button>
                <Button variant="outline" onClick={() => router.push("/settings")}>
                  Workspace Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          accounts.map((account) => {
            const status = accountStatus(account);
            const sc = statusConfig[status];
            const pc = providerConfig[account.provider];
            const healthScore = Math.round(account.health_score * 100);
            const warmupProgress = Math.round(
              (account.warmup_level / Math.max(account.daily_limit, 1)) * 100
            );
            const displayName = account.display_name || account.email;
            const ws = warmupStatuses[account.id];
            const wpc = ws ? warmupPhaseConfig[ws.phase] : null;

            return (
              <Card
                key={account.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/accounts/${account.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        {account.provider === "google" ? (
                          <GoogleLogo className="h-5 w-5" />
                        ) : account.provider === "microsoft" ? (
                          <MicrosoftLogo className="h-5 w-5" />
                        ) : (
                          <Mail className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-medium">
                          {displayName}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {account.email}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {wpc && (
                        <Badge variant="secondary" className={`text-xs ${wpc.className}`}>
                          {wpc.label}
                        </Badge>
                      )}
                      <Badge variant="secondary" className={sc.className}>
                        {sc.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Provider badge + actions */}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${pc.badgeClass}`}
                    >
                      {pc.icon} {pc.badge}
                    </Badge>
                    {account.provider !== "manual" &&
                      isOAuthProviderEnabled(account.provider as "google" | "microsoft") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOAuthRedirect(account.provider as "google" | "microsoft");
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Reconnect
                      </Button>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(account);
                        }}
                        title="Edit account"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(account);
                        }}
                        title="Delete account"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Health Score */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1 cursor-help">
                              Health Score
                              <Info className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs space-y-1 p-3">
                            <p className="font-medium">Health score reflects sender reputation</p>
                            <p>Bounces reduce score by 5%</p>
                            <p>Replies increase score by 1%</p>
                            <p className="text-muted-foreground">Keep above 80% for best deliverability</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span
                        className={`text-sm font-semibold ${healthTextColor(
                          healthScore
                        )}`}
                      >
                        {healthScore}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
                      <div
                        className={`h-full rounded-full transition-all ${healthColor(
                          healthScore
                        )}`}
                        style={{ width: `${healthScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Warmup Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Flame className="h-3.5 w-3.5 text-orange-500" />
                        <span className="text-xs text-muted-foreground">
                          Warmup
                        </span>
                      </div>
                      <span className="text-xs font-medium">
                        {warmupProgress}%
                      </span>
                    </div>
                    <Progress value={warmupProgress} className="h-1.5" />
                  </div>

                  {/* DNS Checks */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      {account.spf_verified ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-xs">SPF</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {account.dkim_verified ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-xs">DKIM</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {account.dmarc_verified ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-xs">DMARC</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 ml-auto text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); handleVerifyDns(account.id); }}
                      disabled={!!verifyingDns[account.id]}
                    >
                      {verifyingDns[account.id] ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Shield className="h-3 w-3 mr-1" />
                      )}
                      {verifyingDns[account.id] ? "Verifying..." : "Verify DNS"}
                    </Button>
                  </div>

                  {/* Sends Today + Test Connection */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Sends today
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {account.sent_today}/{account.daily_limit}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); handleTestConnection(account.id); }}
                        disabled={!!testingConnection[account.id]}
                      >
                        {testingConnection[account.id] ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Plug className="h-3 w-3 mr-1" />
                        )}
                        {testingConnection[account.id] ? "Testing..." : "Test"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
