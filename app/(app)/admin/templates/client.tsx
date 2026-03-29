"use client";

import { useState, useTransition, useEffect } from "react";
import {
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from "@/app/actions/templates";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </>
  );
}

function TemplateCard({ template }: { template: Template }) {
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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
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
