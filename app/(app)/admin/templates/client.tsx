"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import {
  bulkArchiveTemplates,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from "@/app/actions/templates";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelect } from "@/lib/hooks/use-bulk-select";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  templateContent: string | null;
  mergeFields: string[] | null;
  requiresSignature: boolean;
  createdAt: string;
  updatedAt: string;
};

const CATEGORIES = [
  { value: "intake", label: "Intake" },
  { value: "medical", label: "Medical" },
  { value: "legal", label: "Legal" },
  { value: "correspondence", label: "Correspondence" },
  { value: "filing", label: "Filing" },
  { value: "other", label: "Other" },
];

export function TemplatesClient({ templates }: { templates: Template[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  function resetForm() {
    setName("");
    setDescription("");
    setCategory("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    startTransition(async () => {
      try {
        await createDocumentTemplate({
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
        });
        resetForm();
        setOpen(false);
      } catch {
        setError("Failed to create template. Please try again.");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Document Templates"
        description="Manage document templates with merge fields."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" aria-hidden="true" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>New Template</DialogTitle>
                  <DialogDescription>
                    Create a new document template for your organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Name</Label>
                    <Input
                      id="template-name"
                      placeholder="e.g. SSA Disability Report"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-description">Description</Label>
                    <Textarea
                      id="template-description"
                      placeholder="Brief description of this template..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      disabled={isPending}
                      className="resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-category">Category</Label>
                    <Select
                      value={category}
                      onValueChange={setCategory}
                      disabled={isPending}
                    >
                      <SelectTrigger id="template-category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {error && (
                  <p className="mt-3 text-sm text-destructive">{error}</p>
                )}
                <DialogFooter className="mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      resetForm();
                    }}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending || !name.trim()}>
                    {isPending ? "Creating..." : "Create Template"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={File01Icon}
          title="No templates yet"
          description="Create your first document template."
        />
      ) : (
        <TemplatesListInner templates={templates} />
      )}
    </>
  );
}

function TemplatesListInner({ templates }: { templates: Template[] }) {
  // Debounced search state — filters before bulk-select consumes the list.
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  const filteredTemplates = useMemo(() => {
    if (!query) return templates;
    return templates.filter((t) => {
      const categoryLabel = t.category
        ? (
            CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category
          ).toLowerCase()
        : "";
      const mergeFieldText = (t.mergeFields ?? []).join(" ").toLowerCase();
      return (
        t.name.toLowerCase().includes(query) ||
        (t.description ?? "").toLowerCase().includes(query) ||
        categoryLabel.includes(query) ||
        (t.category ?? "").toLowerCase().includes(query) ||
        mergeFieldText.includes(query)
      );
    });
  }, [templates, query]);

  const bulk = useBulkSelect(filteredTemplates, (t) => t.id);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [isBulkPending, startBulkTransition] = useTransition();

  function handleBulkArchive() {
    const ids = Array.from(bulk.selectedIds);
    startBulkTransition(async () => {
      try {
        const result = await bulkArchiveTemplates(ids);
        toast.success(
          `Archived ${result.updated} template${
            result.updated === 1 ? "" : "s"
          }.`,
        );
        bulk.clear();
        setConfirmArchiveOpen(false);
      } catch {
        toast.error("Failed to archive templates.");
      }
    });
  }

  return (
    <>
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Search templates…"
          aria-label="Search templates"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            aria-label="Select all visible templates"
            checked={
              bulk.isAllSelected
                ? true
                : bulk.isSomeSelected
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={bulk.toggleAll}
          />
          Select all
        </label>
      </div>

      {filteredTemplates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No templates match &ldquo;{rawQuery}&rdquo;.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={bulk.isSelected(template.id)}
              onToggleSelect={() => bulk.toggle(template.id)}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
      >
        <BulkActionBar
          count={bulk.selectedCount}
          label="template"
          onClear={bulk.clear}
        >
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              onClick={() => setConfirmArchiveOpen(true)}
            >
              Archive
            </Button>
          </AlertDialogTrigger>
        </BulkActionBar>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {bulk.selectedCount} template
              {bulk.selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Archived templates are hidden from lists and can&apos;t be used to
              generate new documents. Previously generated documents keep
              working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkArchive}
              disabled={isBulkPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TemplateCard({
  template,
  selected,
  onToggleSelect,
}: {
  template: Template;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editName, setEditName] = useState(template.name);
  const [editDescription, setEditDescription] = useState(
    template.description ?? "",
  );
  const [editCategory, setEditCategory] = useState(template.category ?? "");

  useEffect(() => {
    if (editOpen) {
      setEditName(template.name);
      setEditDescription(template.description ?? "");
      setEditCategory(template.category ?? "");
    }
  }, [editOpen, template]);

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;

    startTransition(async () => {
      try {
        await updateDocumentTemplate(template.id, {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          category: editCategory || undefined,
        });
        toast.success("Template updated.");
        setEditOpen(false);
      } catch {
        toast.error("Failed to update template.");
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteDocumentTemplate(template.id);
        toast.success("Template deleted.");
      } catch {
        toast.error("Failed to delete template.");
      }
    });
  }

  return (
    <Card
      data-selected={selected ? "true" : undefined}
      className="data-[selected=true]:ring-2 data-[selected=true]:ring-primary/40"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          {onToggleSelect && (
            <div
              className="pt-0.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Checkbox
                aria-label={`Select template ${template.name}`}
                checked={!!selected}
                onCheckedChange={() => onToggleSelect()}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground truncate">
              {template.name}
            </h3>
            {template.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {template.description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {template.category && (
            <Badge variant="secondary" className="text-xs">
              {CATEGORIES.find((c) => c.value === template.category)?.label ??
                template.category}
            </Badge>
          )}
          {template.mergeFields && template.mergeFields.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {template.mergeFields.length} merge field
              {template.mergeFields.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {template.requiresSignature && (
            <Badge
              variant="outline"
              className="text-xs border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
            >
              Signature Required
            </Badge>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <TemplatePreviewDialog
            template={template}
            onEdit={() => setEditOpen(true)}
          />
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleEditSubmit}>
                <DialogHeader>
                  <DialogTitle>Edit Template</DialogTitle>
                  <DialogDescription>
                    Update template details.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-name-${template.id}`}>Name</Label>
                    <Input
                      id={`edit-name-${template.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-desc-${template.id}`}>
                      Description
                    </Label>
                    <Textarea
                      id={`edit-desc-${template.id}`}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      disabled={isPending}
                      className="resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-cat-${template.id}`}>Category</Label>
                    <Select
                      value={editCategory}
                      onValueChange={setEditCategory}
                      disabled={isPending}
                    >
                      <SelectTrigger id={`edit-cat-${template.id}`}>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || !editName.trim()}
                  >
                    {isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                disabled={isPending}
              >
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Template</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete the template &quot;{template.name}&quot;.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isPending ? "Deleting..." : "Delete Template"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Split a template body into plain-text and `{{mergeField}}` segments so the
 * preview can highlight merge tokens inline without using
 * `dangerouslySetInnerHTML`.
 */
function renderTemplateBodySegments(body: string) {
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`t-${key++}`}>{body.slice(lastIndex, match.index)}</span>,
      );
    }
    nodes.push(
      <code
        key={`m-${key++}`}
        className="bg-muted rounded px-1 font-mono text-[12px]"
      >
        {match[0]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    nodes.push(<span key={`t-${key++}`}>{body.slice(lastIndex)}</span>);
  }
  return nodes;
}

function TemplatePreviewDialog({
  template,
  onEdit,
}: {
  template: Template;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const categoryLabel = template.category
    ? (CATEGORIES.find((c) => c.value === template.category)?.label ??
      template.category)
    : null;
  const body = template.templateContent ?? "";
  const bodySegments = body ? renderTemplateBodySegments(body) : null;
  const mergeFields = template.mergeFields ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          aria-label={`Preview ${template.name}`}
        >
          <Eye className="size-4" aria-hidden="true" />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            {categoryLabel
              ? `Category: ${categoryLabel}`
              : "No category assigned"}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          {mergeFields.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Merge fields ({mergeFields.length})
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mergeFields.map((field) => (
                  <code
                    key={field}
                    className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]"
                  >
                    {`{{${field}}}`}
                  </code>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              This template has no merge fields defined.
            </p>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Body
            </h3>
            {body ? (
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-[#FAFAFA] p-3 text-sm text-foreground font-sans">
                {bodySegments}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No body content has been saved for this template yet.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
