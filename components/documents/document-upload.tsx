"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  validateFiles,
  formatFileSize,
  ACCEPT_STRING,
  type FileValidationError,
} from "@/lib/storage/client";
import { cn } from "@/lib/utils";

type DocumentUploadProps = {
  onUpload: (files: File[]) => Promise<void>;
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
      await onUpload(pendingFiles);
      setPendingFiles([]);
      setErrors([]);
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
  }, [pendingFiles, onUpload]);

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
            : "border-gray-300 hover:border-gray-400",
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

        <Upload className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          Drag and drop files here, or{" "}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-blue-600 hover:text-blue-500"
            disabled={disabled}
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          PDF, Word, Excel, images, text files up to 50MB
        </p>
      </div>

      {/* Pending files list */}
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          {pendingFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-gray-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
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
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
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
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
