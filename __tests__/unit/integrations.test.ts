import { describe, it, expect } from "vitest";
import { validatePayload, normalizePhone } from "@/lib/integrations/zapier";
import {
  buildChronicleUrl,
  isValidChronicleUrl,
  extractClaimantId,
} from "@/lib/integrations/chronicle";

describe("Zapier integration", () => {
  describe("validatePayload", () => {
    it("validates a complete payload", () => {
      const result = validatePayload({
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        phone: "555-123-4567",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.firstName).toBe("John");
        expect(result.data.lastName).toBe("Smith");
        expect(result.data.email).toBe("john@example.com");
        expect(result.data.source).toBe("website");
      }
    });

    it("validates minimal payload", () => {
      const result = validatePayload({
        firstName: "John",
        lastName: "Smith",
      });
      expect(result.valid).toBe(true);
    });

    it("rejects missing firstName", () => {
      const result = validatePayload({ lastName: "Smith" });
      expect(result.valid).toBe(false);
    });

    it("rejects missing lastName", () => {
      const result = validatePayload({ firstName: "John" });
      expect(result.valid).toBe(false);
    });

    it("rejects null body", () => {
      const result = validatePayload(null);
      expect(result.valid).toBe(false);
    });

    it("rejects non-object body", () => {
      const result = validatePayload("not an object");
      expect(result.valid).toBe(false);
    });
  });

  describe("normalizePhone", () => {
    it("normalizes 10-digit US numbers", () => {
      expect(normalizePhone("5551234567")).toBe("+15551234567");
    });

    it("normalizes formatted numbers", () => {
      expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
      expect(normalizePhone("555-123-4567")).toBe("+15551234567");
    });

    it("normalizes 11-digit with leading 1", () => {
      expect(normalizePhone("15551234567")).toBe("+15551234567");
    });

    it("passes through other formats", () => {
      expect(normalizePhone("+44123456789")).toBe("+44123456789");
    });
  });
});

describe("Chronicle integration", () => {
  describe("buildChronicleUrl", () => {
    it("builds a URL with claimant ID", () => {
      const url = buildChronicleUrl("ABC123");
      expect(url).toContain("ABC123");
    });
  });

  describe("isValidChronicleUrl", () => {
    it("validates Chronicle URLs", () => {
      expect(isValidChronicleUrl("https://chronicle.app/claimants/123")).toBe(
        true,
      );
    });

    it("rejects non-Chronicle URLs", () => {
      expect(isValidChronicleUrl("https://google.com")).toBe(false);
    });

    it("rejects invalid URLs", () => {
      expect(isValidChronicleUrl("not a url")).toBe(false);
    });
  });

  describe("extractClaimantId", () => {
    it("extracts claimant ID from URL", () => {
      expect(
        extractClaimantId("https://chronicle.app/claimants/ABC123"),
      ).toBe("ABC123");
    });

    it("returns null for URLs without claimant path", () => {
      expect(extractClaimantId("https://chronicle.app/dashboard")).toBeNull();
    });

    it("returns null for invalid URLs", () => {
      expect(extractClaimantId("not a url")).toBeNull();
    });
  });
});
