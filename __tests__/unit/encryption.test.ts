import { describe, it, expect, vi } from "vitest";

// Mock environment variable before importing
vi.stubEnv("ENCRYPTION_KEY", "test-encryption-key-for-vitest-suite");

import {
  encrypt,
  decrypt,
  maskSSN,
  isValidSSN,
  formatSSN,
  getSSNLast4,
} from "@/lib/encryption";

describe("encryption", () => {
  describe("encrypt/decrypt roundtrip", () => {
    it("encrypts and decrypts a string correctly", () => {
      const plaintext = "123-45-6789";
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toBeTruthy();

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertexts for the same input (random IV)", () => {
      const plaintext = "123-45-6789";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const encrypted = encrypt("");
      expect(decrypt(encrypted)).toBe("");
    });
  });

  describe("maskSSN", () => {
    it("masks a formatted SSN", () => {
      expect(maskSSN("123-45-6789")).toBe("***-**-6789");
    });

    it("masks a plain SSN", () => {
      expect(maskSSN("123456789")).toBe("***-**-6789");
    });

    it("handles short input gracefully", () => {
      expect(maskSSN("12")).toBe("***-**-****");
    });
  });

  describe("isValidSSN", () => {
    it("validates correct SSNs", () => {
      expect(isValidSSN("123-45-6789")).toBe(true);
      expect(isValidSSN("123456789")).toBe(true);
    });

    it("rejects SSNs starting with 000", () => {
      expect(isValidSSN("000-12-3456")).toBe(false);
    });

    it("rejects SSNs starting with 666", () => {
      expect(isValidSSN("666-12-3456")).toBe(false);
    });

    it("rejects SSNs starting with 900+", () => {
      expect(isValidSSN("900-12-3456")).toBe(false);
      expect(isValidSSN("999-12-3456")).toBe(false);
    });

    it("rejects SSNs with group 00", () => {
      expect(isValidSSN("123-00-6789")).toBe(false);
    });

    it("rejects SSNs with serial 0000", () => {
      expect(isValidSSN("123-45-0000")).toBe(false);
    });

    it("rejects wrong-length input", () => {
      expect(isValidSSN("12345678")).toBe(false);
      expect(isValidSSN("1234567890")).toBe(false);
    });
  });

  describe("formatSSN", () => {
    it("formats a plain SSN", () => {
      expect(formatSSN("123456789")).toBe("123-45-6789");
    });

    it("passes through already-formatted SSN", () => {
      expect(formatSSN("123-45-6789")).toBe("123-45-6789");
    });

    it("returns original if wrong length", () => {
      expect(formatSSN("12345")).toBe("12345");
    });
  });

  describe("getSSNLast4", () => {
    it("extracts last 4 digits", () => {
      expect(getSSNLast4("123-45-6789")).toBe("6789");
      expect(getSSNLast4("123456789")).toBe("6789");
    });
  });
});
