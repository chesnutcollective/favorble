/**
 * Client-side file validation utilities for document uploads.
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/rtf",
]);

const ACCEPT_STRING = Array.from(ALLOWED_MIME_TYPES).join(",");

export type FileValidationError = {
  file: File;
  reason: "size" | "type";
  message: string;
};

export type FileValidationResult = {
  valid: File[];
  invalid: FileValidationError[];
};

/**
 * Validate files before upload. Returns valid and invalid files with reasons.
 */
export function validateFiles(files: File[]): FileValidationResult {
  const valid: File[] = [];
  const invalid: FileValidationError[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      invalid.push({
        file,
        reason: "size",
        message: `${file.name} exceeds the 50MB file size limit`,
      });
    } else if (!ALLOWED_MIME_TYPES.has(file.type)) {
      invalid.push({
        file,
        reason: "type",
        message: `${file.name} is not a supported file type`,
      });
    } else {
      valid.push(file);
    }
  }

  return { valid, invalid };
}

/**
 * Format file size for display (e.g., "2.5 MB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Get file icon type based on MIME type.
 */
export function getFileIconType(
  mimeType: string,
): "pdf" | "image" | "doc" | "spreadsheet" | "text" | "unknown" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  // Check spreadsheet before doc — spreadsheet MIME types also contain "document"
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
    return "spreadsheet";
  if (
    mimeType.includes("word") ||
    mimeType.includes("wordprocessingml") ||
    mimeType === "application/rtf"
  )
    return "doc";
  if (mimeType.startsWith("text/")) return "text";
  return "unknown";
}

/**
 * Check if a file type can be previewed in the browser.
 */
export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType === "text/plain"
  );
}

/**
 * The accept string for file input elements.
 */
export { ACCEPT_STRING };
