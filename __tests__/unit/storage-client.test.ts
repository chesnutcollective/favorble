import { describe, it, expect } from "vitest";
import {
  validateFiles,
  formatFileSize,
  getFileIconType,
  isPreviewable,
} from "@/lib/storage/client";

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("storage client utilities", () => {
  describe("validateFiles", () => {
    it("accepts valid files", () => {
      const files = [
        createMockFile("doc.pdf", 1024, "application/pdf"),
        createMockFile("photo.jpg", 2048, "image/jpeg"),
      ];
      const result = validateFiles(files);
      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(0);
    });

    it("rejects files over 50MB", () => {
      const files = [
        createMockFile("huge.pdf", 51 * 1024 * 1024, "application/pdf"),
      ];
      const result = validateFiles(files);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toBe("size");
    });

    it("rejects unsupported file types", () => {
      const files = [
        createMockFile("virus.exe", 1024, "application/x-executable"),
      ];
      const result = validateFiles(files);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0].reason).toBe("type");
    });

    it("separates valid and invalid files", () => {
      const files = [
        createMockFile("good.pdf", 1024, "application/pdf"),
        createMockFile("bad.exe", 1024, "application/x-executable"),
        createMockFile("big.pdf", 51 * 1024 * 1024, "application/pdf"),
      ];
      const result = validateFiles(files);
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(2);
    });
  });

  describe("formatFileSize", () => {
    it("formats bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("formats kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatFileSize(1048576)).toBe("1.0 MB");
      expect(formatFileSize(2621440)).toBe("2.5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatFileSize(1073741824)).toBe("1.0 GB");
    });
  });

  describe("getFileIconType", () => {
    it("identifies PDFs", () => {
      expect(getFileIconType("application/pdf")).toBe("pdf");
    });

    it("identifies images", () => {
      expect(getFileIconType("image/jpeg")).toBe("image");
      expect(getFileIconType("image/png")).toBe("image");
    });

    it("identifies documents", () => {
      expect(getFileIconType("application/msword")).toBe("doc");
      expect(
        getFileIconType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      ).toBe("doc");
    });

    it("identifies spreadsheets", () => {
      expect(
        getFileIconType(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      ).toBe("spreadsheet");
    });

    it("identifies text files", () => {
      expect(getFileIconType("text/plain")).toBe("text");
      expect(getFileIconType("text/csv")).toBe("text");
    });

    it("returns unknown for unrecognized types", () => {
      expect(getFileIconType("application/octet-stream")).toBe("unknown");
    });
  });

  describe("isPreviewable", () => {
    it("returns true for previewable types", () => {
      expect(isPreviewable("application/pdf")).toBe(true);
      expect(isPreviewable("image/jpeg")).toBe(true);
      expect(isPreviewable("image/png")).toBe(true);
      expect(isPreviewable("text/plain")).toBe(true);
    });

    it("returns false for non-previewable types", () => {
      expect(isPreviewable("application/msword")).toBe(false);
      expect(isPreviewable("text/csv")).toBe(false);
    });
  });
});
