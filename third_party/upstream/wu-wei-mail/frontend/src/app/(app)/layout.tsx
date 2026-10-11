"use client";

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";

function getPageTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "Dashboard";

  const [section, subsection] = segments;

  if (section === "campaigns" && subsection === "new") return "New Campaign";
  if (section === "campaigns" && segments.length === 3 && segments[2] === "workflow") return "Workflow Builder";
  if (section === "campaigns" && segments.length === 2) return "Campaign Details";
  if (section === "workflows" && subsection === "new") return "New Workflow";
  if (section === "workflows" && segments.length === 2) return "Workflow Builder";
  if (section === "accounts" && segments.length === 2) return "Account Details";
  if (section === "leads" && subsection === "import") return "Import Leads";

  const titles: Record<string, string> = {
    dashboard: "Dashboard",
    campaigns: "Campaigns",
    workflows: "Workflows",
    leads: "Leads",
    templates: "Templates",
    inbox: "Inbox",
    accounts: "Accounts",
    analytics: "Analytics",
    settings: "Settings",
    "auto-responder": "Auto-Responder",
    prospecting: "Prospecting",
  };
  const last = segments[segments.length - 1];
  if (titles[last]) return titles[last];
  return last
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getPageSubtitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "Monitor outreach health and campaign momentum.";

  const [section, subsection] = segments;

  if (section === "campaigns" && subsection === "new") {
    return "Configure sequence logic, audience, and account routing before launch.";
  }
  if (section === "campaigns" && segments.length === 3 && segments[2] === "workflow") {
    return "Design multichannel outreach flows with drag-and-drop nodes.";
  }
  if (section === "campaigns" && segments.length === 2) {
    return "Review performance, sequence logic, and campaign controls in one place.";
  }
  if (section === "workflows" && subsection === "new") {
    return "Create a standalone automation workflow with data source nodes.";
  }
  if (section === "workflows" && segments.length === 2) {
    return "Design multichannel outreach flows with drag-and-drop nodes.";
  }
  if (section === "accounts" && segments.length === 2) {
    return "Inspect DNS, warmup progress, and sending health for this account.";
  }
  if (section === "leads" && subsection === "import") {
    return "Map and validate imported contacts before adding them to lead lists.";
  }

  const subtitles: Record<string, string> = {
    dashboard: "Monitor outreach health and campaign momentum.",
    campaigns: "Launch, control, and iterate outbound sequences.",
    workflows: "Build standalone automation flows with campaign and lead data nodes.",
    leads: "Organize contact quality and list readiness.",
    templates: "Refine messaging assets for every sequence.",
    inbox: "Handle live replies and keep conversations moving.",
    accounts: "Manage sending infrastructure and deliverability trust.",
    analytics: "Understand performance signals across campaigns.",
    settings: "Control workspace configuration and guardrails.",
    "auto-responder": "Automate responses while protecting quality.",
    prospecting: "Guide AI-assisted lead discovery to launch-ready campaigns.",
  };
  const first = segments[0];
  return subtitles[first] ?? "Manage your outbound operations from one place.";
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [commandOpen, setCommandOpen] = useState(false);
  const title = getPageTitle(pathname);
  const subtitle = getPageSubtitle(pathname);
  const workspaceDomain = user?.email?.split("@")[1] ?? "workspace";

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/72 backdrop-blur-xl">
          <div className="flex h-16 shrink-0 items-center gap-2 px-5">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 !h-4 opacity-60" />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <div className="flex min-w-0 flex-col">
                      <BreadcrumbPage className="font-semibold text-foreground">
                        {title}
                      </BreadcrumbPage>
                      <span className="hidden truncate text-xs text-muted-foreground sm:block">
                        {subtitle}
                      </span>
                    </div>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="hidden items-center gap-2 lg:flex">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 text-muted-foreground text-xs font-normal"
                  onClick={() => setCommandOpen(true)}
                >
                  <Search className="h-3.5 w-3.5" />
                  Search
                  <kbd className="pointer-events-none ml-1 inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    <span className="text-xs">&#8984;</span>K
                  </kbd>
                </Button>
                <span className="rounded-full border border-border/70 bg-card/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {workspaceDomain}
                </span>
                <span className="rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Live Workspace
                </span>
              </div>
            </div>
          </div>
        </header>
        <main className="relative flex-1 overflow-auto">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_115%_-8%,oklch(0.88_0.05_56/0.24),transparent_60%)]" />
          <div className="relative animate-page-float-in">
            {children}
          </div>
        </main>
      </SidebarInset>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </SidebarProvider>
  );
}
