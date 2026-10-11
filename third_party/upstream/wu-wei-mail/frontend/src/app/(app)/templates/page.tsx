"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, Copy, Trash2, Pencil, Eye, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Template, TemplatePreviewResponse } from "@/lib/types";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const categories = ["All", "Cold Outreach", "Follow Up", "Event"];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for the create dialog
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategory, setFormCategory] = useState("Cold Outreach");

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("Cold Outreach");
  const [editSaving, setEditSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Delete confirm state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Preview state
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<TemplatePreviewResponse | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<Template[]>("/api/templates");
      setTemplates(data);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormName("");
    setFormSubject("");
    setFormBody("");
    setFormCategory("Cold Outreach");
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formSubject.trim() || !formBody.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setSaving(true);
      const created = await api.post<Template>("/api/templates", {
        name: formName,
        subject: formSubject,
        body: formBody,
        category: formCategory,
      });
      setTemplates((prev) => [...prev, created]);
      setDialogOpen(false);
      resetForm();
      toast.success("Template created");
    } catch {
      toast.error("Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  function openDeleteConfirm(template: Template) {
    setDeletingTemplate(template);
    setDeleteOpen(true);
  }

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/templates/${deletingTemplate.id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
      setDeleteOpen(false);
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Edit dialog helpers
  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setEditName(template.name);
    setEditSubject(template.subject);
    setEditBody(template.body);
    setEditCategory(template.category || "Cold Outreach");
    setPreview(null);
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setEditingTemplate(null);
    setPreview(null);
  };

  const handlePreview = async () => {
    try {
      setPreviewing(true);
      const result = await api.post<TemplatePreviewResponse>(
        "/api/templates/preview",
        {
          subject: editSubject,
          body: editBody,
          sample_data: {
            first_name: "John",
            company: "Acme Corp",
            title: "CEO",
          },
        }
      );
      setPreview(result);
    } catch {
      toast.error("Failed to generate preview");
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!editingTemplate) return;
    if (!editName.trim() || !editSubject.trim() || !editBody.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setEditSaving(true);
      const updated = await api.patch<Template>(
        `/api/templates/${editingTemplate.id}`,
        {
          name: editName,
          subject: editSubject,
          body: editBody,
          category: editCategory,
        }
      );
      setTemplates((prev) =>
        prev.map((t) => (t.id === editingTemplate.id ? updated : t))
      );
      closeEditDialog();
      toast.success("Template updated");
    } catch {
      toast.error("Failed to update template");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDuplicate = async (template?: Template) => {
    const source = template || editingTemplate;
    if (!source) return;

    const name = template ? template.name : editName;
    const subject = template ? template.subject : editSubject;
    const body = template ? template.body : editBody;
    const category = template ? (template.category || "Cold Outreach") : editCategory;

    try {
      setDuplicating(true);
      const created = await api.post<Template>("/api/templates", {
        name: `${name} (Copy)`,
        subject,
        body,
        category,
      });
      setTemplates((prev) => [...prev, created]);
      if (!template) closeEditDialog();
      toast.success("Template duplicated");
    } catch {
      toast.error("Failed to duplicate template");
    } finally {
      setDuplicating(false);
    }
  };

  const filtered =
    categoryFilter === "All"
      ? templates
      : templates.filter((t) => t.category === categoryFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable email templates for your campaigns
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Template</DialogTitle>
              <DialogDescription>
                Build a reusable email template
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  placeholder="e.g., Cold Intro — Short"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
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
              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  placeholder="Quick question, {{first_name}}"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea
                  placeholder="Write your email template..."
                  rows={8}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Saving..." : "Save Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={categoryFilter === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Template Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div>
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </CardContent>
              <CardFooter className="border-t pt-3">
                <Skeleton className="h-8 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-sm font-medium">No templates found</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {categoryFilter === "All"
              ? "Create your first email template to get started"
              : `No templates in the "${categoryFilter}" category`}
          </p>
          {categoryFilter === "All" && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{template.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] mt-1">
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Subject: {template.subject}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-line">
                  {template.body}
                </p>
              </CardContent>
              <CardFooter className="border-t pt-3">
                <div className="flex items-center gap-1 w-full">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(template)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDuplicate(template)}
                    disabled={duplicating}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => openDeleteConfirm(template)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Template"
        description={
          <>
            Are you sure you want to delete <span className="font-medium text-foreground">{deletingTemplate?.name}</span>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete Template"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
      />

      {/* Edit / Preview Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) closeEditDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Modify the template and preview with sample data
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                placeholder="e.g., Cold Intro — Short"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
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
            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input
                placeholder="Quick question, {{first_name}}"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                placeholder="Write your email template..."
                rows={8}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
            </div>

            {/* Preview Button */}
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={previewing}
              className="w-full"
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              {previewing ? "Generating Preview..." : "Preview with Sample Data"}
            </Button>

            {/* Preview Result */}
            {preview && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-semibold">Preview</h4>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Subject
                  </p>
                  <p className="text-sm font-medium">{preview.subject}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Body
                  </p>
                  <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-line leading-relaxed">
                    {preview.body}
                  </div>
                </div>

                {/* Variables Found */}
                {preview.variables_found.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Variables Found
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.variables_found.map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs">
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {preview.errors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-red-600">Errors</p>
                    {preview.errors.map((err, i) => (
                      <p key={i} className="text-sm text-red-600">
                        {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => handleDuplicate()}
              disabled={duplicating}
              className="sm:mr-auto"
            >
              {duplicating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {duplicating ? "Duplicating..." : "Duplicate"}
            </Button>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

