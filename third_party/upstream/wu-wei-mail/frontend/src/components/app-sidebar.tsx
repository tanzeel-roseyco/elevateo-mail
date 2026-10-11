"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  LogOut,
  Megaphone,
  Users,
  FileText,
  Inbox,
  Mail,
  BarChart3,
  Settings,
  Send,
  Bot,
  Compass,
  Network,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Workflows", url: "/workflows", icon: Network },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Templates", url: "/templates", icon: FileText },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Auto-Responder", url: "/auto-responder", icon: Bot },
  { title: "Prospecting", url: "/prospecting", icon: Compass },
];

const manageNav = [
  { title: "Accounts", url: "/accounts", icon: Mail },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = user
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  return (
    <Sidebar className="noise-texture bg-[linear-gradient(185deg,oklch(0.28_0.02_250)_0%,oklch(0.22_0.02_250)_100%)]">
      <SidebarHeader className="relative z-10 px-4 py-4">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2.5 rounded-xl border border-sidebar-border/50 bg-sidebar-accent/45 px-3 py-3 transition-colors hover:border-sidebar-border/80 hover:bg-sidebar-accent/65"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,oklch(0.68_0.14_42)_0%,oklch(0.63_0.16_28)_100%)] text-sidebar-primary-foreground shadow-[0_10px_18px_-12px_oklch(0.15_0.04_250/0.95)]">
            <Send className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-sm font-semibold tracking-tight text-sidebar-foreground transition-opacity group-hover:opacity-100">
              Wu Wei Mail
            </span>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/55">
              Studio
              <span className="h-1 w-1 rounded-full bg-sidebar-primary/80" />
              Outreach OS
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator className="relative z-10 opacity-30" />

      <SidebarContent className="relative z-10">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-medium">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-medium">
            Manage
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manageNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="relative z-10 border-t border-sidebar-border/45 px-4 py-4">
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/55 bg-sidebar-accent/35 p-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary ring-1 ring-sidebar-primary/35">
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">{user?.full_name}</span>
            <span className="truncate text-[11px] text-sidebar-foreground/55">{user?.email}</span>
          </div>
          <button
            onClick={logout}
            className="ml-auto rounded-lg border border-transparent p-1.5 text-sidebar-foreground/45 transition-colors hover:border-sidebar-border/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
