"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X } from "lucide-react";
import type { DashboardStats } from "@/lib/types";

interface OnboardingChecklistProps {
  stats: DashboardStats | null;
  accountCount: number;
}

const DISMISSED_KEY = "onboarding-dismissed";

interface Step {
  label: string;
  href: string;
  completed: boolean;
}

export function OnboardingChecklist({ stats, accountCount }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const steps: Step[] = [
    {
      label: "Connect a Sending Account",
      href: "/accounts",
      completed: accountCount > 0,
    },
    {
      label: "Import Your First Leads",
      href: "/leads/import",
      completed: (stats?.total_leads ?? 0) > 0,
    },
    {
      label: "Launch Your First Campaign",
      href: "/campaigns/new",
      completed:
        (stats?.active_campaigns ?? 0) > 0 || (stats?.total_sent ?? 0) > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allComplete = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  if (dismissed || allComplete) return null;

  function handleDismiss() {
    try { localStorage.setItem(DISMISSED_KEY, "true"); } catch { /* quota exceeded / private browsing */ }
    setDismissed(true);
  }

  return (
    <Card className="animate-fade-in-up">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Get Started</CardTitle>
          <p className="text-sm text-muted-foreground">
            Complete these steps to start sending campaigns
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground -mt-1 -mr-2"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completedCount} of {steps.length} complete</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="space-y-2">
          {steps.map((step) => (
            <Link
              key={step.href}
              href={step.href}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              {step.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={`text-sm ${
                  step.completed
                    ? "text-muted-foreground line-through"
                    : "font-medium"
                }`}
              >
                {step.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
