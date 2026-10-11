"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, ListChecks, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type {
  LeadList,
  WorkflowEnrollRequest,
  WorkflowEnrollResponse,
} from "@/lib/types";

interface EnrollLeadsDialogProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled?: () => void;
}

export function EnrollLeadsDialog({
  workflowId,
  open,
  onOpenChange,
  onEnrolled,
}: EnrollLeadsDialogProps) {
  const [lists, setLists] = useState<LeadList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [result, setResult] = useState<WorkflowEnrollResponse | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedListId(null);
      setResult(null);
      return;
    }
    setLoadingLists(true);
    api
      .get<LeadList[]>("/api/leads/lists/all")
      .then(setLists)
      .catch(() => toast.error("Failed to load lead lists"))
      .finally(() => setLoadingLists(false));
  }, [open]);

  async function handleEnroll() {
    if (!selectedListId) return;
    setEnrolling(true);
    try {
      const body: WorkflowEnrollRequest = { list_id: selectedListId };
      const res = await api.post<WorkflowEnrollResponse>(
        `/api/workflows/${workflowId}/enroll`,
        body,
      );
      setResult(res);
      if (res.enrolled > 0) {
        toast.success(`Enrolled ${res.enrolled} lead${res.enrolled !== 1 ? "s" : ""}`);
        onEnrolled?.();
      } else if (res.duplicates > 0) {
        toast.info("All leads were already enrolled in this workflow");
      }
    } catch {
      toast.error("Failed to enroll leads");
    } finally {
      setEnrolling(false);
    }
  }

  const selectedList = lists.find((l) => l.id === selectedListId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll Leads</DialogTitle>
          <DialogDescription>
            Select a lead list to enroll into this workflow. Each lead will start
            at the trigger node.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-4 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500" />
            <div>
              <p className="text-sm font-medium">
                {result.enrolled} lead{result.enrolled !== 1 ? "s" : ""} enrolled
              </p>
              {result.duplicates > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {result.duplicates} already in workflow (skipped)
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2 text-xs text-red-600">
                  {result.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {loadingLists ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : lists.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No lead lists found</p>
                  <p className="text-xs mt-1">
                    Create a lead list first, then enroll leads here.
                  </p>
                </div>
              ) : (
                lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => setSelectedListId(list.id)}
                    className={`
                      w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors
                      ${
                        selectedListId === list.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-muted/50"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{list.name}</p>
                        {list.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {list.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {list.member_count} lead{list.member_count !== 1 ? "s" : ""}
                    </Badge>
                  </button>
                ))
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEnroll}
                disabled={!selectedListId || enrolling}
              >
                {enrolling && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Enroll {selectedList ? `${selectedList.member_count} leads` : ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
