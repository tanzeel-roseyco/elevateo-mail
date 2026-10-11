"use client";

import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useMemo } from "react";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  FileText,
  Inbox,
  Bot,
  Compass,
  Mail,
  BarChart3,
  Settings,
  Plus,
  Upload,
  Search,
  Clock,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Auto-Responder", href: "/auto-responder", icon: Bot },
  { label: "Prospecting", href: "/prospecting", icon: Compass },
  { label: "Accounts", href: "/accounts", icon: Mail },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

const quickActions = [
  { label: "New Campaign", href: "/campaigns/new", icon: Plus },
  { label: "Import Leads", href: "/leads/import", icon: Upload },
  { label: "Add Account", href: "/accounts", icon: Mail },
  { label: "New Template", href: "/templates", icon: Plus },
  { label: "Search Leads...", href: "/leads", icon: Search },
  { label: "Search Campaigns...", href: "/campaigns", icon: Search },
  { label: "View Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Check Inbox", href: "/inbox", icon: Inbox },
];

const RECENT_PAGES_KEY = "wu-wei-recent-pages";
const MAX_RECENT = 5;

interface RecentPage {
  label: string;
  href: string;
}

function getRecentPages(): RecentPage[] {
  try {
    const stored = localStorage.getItem(RECENT_PAGES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT);
    return [];
  } catch {
    return [];
  }
}

function addRecentPage(label: string, href: string) {
  const existing = getRecentPages();
  const filtered = existing.filter((p) => p.href !== href);
  const updated = [{ label, href }, ...filtered].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable
  }
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const recentPages = useMemo(() => (open ? getRecentPages() : []), [open]);

  function handleSelect(href: string, label?: string) {
    const resolvedLabel =
      label ||
      navItems.find((n) => n.href === href)?.label ||
      quickActions.find((a) => a.href === href)?.label ||
      href;
    addRecentPage(resolvedLabel, href);
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search pages and actions"
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {recentPages.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentPages.map((page) => (
                <CommandItem
                  key={`recent-${page.href}`}
                  value={`${page.label} recent`}
                  onSelect={() => handleSelect(page.href, page.label)}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => handleSelect(item.href, item.label)}
            >
              <item.icon className="h-4 w-4 mr-2" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          {quickActions.map((item) => (
            <CommandItem
              key={item.label}
              value={`${item.label} action`}
              onSelect={() => handleSelect(item.href, item.label)}
            >
              <item.icon className="h-4 w-4 mr-2" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
