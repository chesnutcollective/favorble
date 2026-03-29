"use client";

import { useCallback, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Upload01Icon,
  Cancel01Icon,
  File01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validateFiles,
  formatFileSize,
  ACCEPT_STRING,
  type FileValidationError,
} from "@/lib/storage/client";
import { cn } from "@/lib/utils";

export const DOCUMENT_CATEGORIES = [
  { value: "medical_records", label: "Medical Records" },
  { value: "ssa_decisions", label: "SSA Decisions" },
  { value: "correspondence", label: "Correspondence" },
  { value: "forms", label: "Forms" },
  { value: "hearing_exhibits", label: "Hearing Exhibits" },
  { value: "contracts", label: "Contracts" },
  { value: "other", label: "Other" },
] as const;

type DocumentUploadProps = {
  onUpload: (files: File[], category?: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function DocumentUpload({
  onUpload,
  disabled = false,
  className,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FileValidationError[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [category, setCategory] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const result = validateFiles(files);

    setPendingFiles((prev) => [...prev, ...result.valid]);
    if (result.invalid.length > 0) {
      setErrors((prev) => [...prev, ...result.invalid]);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [handleFiles],
  );

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const handleUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    try {
      await onUpload(pendingFiles, category || undefined);
      setPendingFiles([]);
      setErrors([]);
      setCategory("");
    } catch {
      setErrors([
        {
          file: pendingFiles[0],
          reason: "type",
          message: "Upload failed. Please try again.",
        },
      ]);
    } finally {
      setIsUploading(false);
    }
  }, [pendingFiles, onUpload, category]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-border hover:border-gray-400",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        <HugeiconsIcon
          icon={Upload01Icon}
          size={32}
          className="mx-auto text-muted-foreground"
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Drag and drop files here, or{" "}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-primary hover:text-primary"
            disabled={disabled}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, Word, Excel, images, text files up to 50MB
        </p>
      </div>

      {/* Pending files list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          {/* Category picker */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground shrink-0">
              Category
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select category (optional)..." />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCategory("")}
                className="text-xs shrink-0"
              >
                Clear
              </Button>
            )}
          </div>

          {pendingFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-md border border-border bg-accent px-3 py-2"
            >
              <HugeiconsIcon
                icon={File01Icon}
                size={16}
                className="shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="shrink-0 text-muted-foreground hover:text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} />
              </button>
            </div>
          ))}

          <Button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full"
          >
            {isUploading
              ? "Uploading..."
              : `Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={16}
              className="mt-0.5 shrink-0 text-red-500"
            />
            <div className="min-w-0 flex-1">
              {errors.map((err, i) => (
                <p key={i} className="text-sm text-red-700">
                  {err.message}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={clearErrors}
              className="shrink-0 text-red-400 hover:text-red-600"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
