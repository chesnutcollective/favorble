import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  // Derive a 256-bit key from the provided key using scrypt
  return scryptSync(key, "caseflow-ssn-salt", 32);
}

/**
 * Encrypt a plaintext string (e.g., SSN).
 * Returns a base64-encoded string containing: salt + iv + tag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Concatenate iv + tag + encrypted
  const result = Buffer.concat([iv, tag, encrypted]);
  return result.toString("base64");
}

/**
 * Decrypt a previously encrypted string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const data = Buffer.from(encryptedBase64, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Mask an SSN for display: "***-**-1234"
 */
export function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  const last4 = digits.slice(-4);
  return `***-**-${last4}`;
}

/**
 * Validate SSN format.
 * Accepts: "123-45-6789" or "123456789"
 */
export function isValidSSN(ssn: string): boolean {
  const cleaned = ssn.replace(/\D/g, "");
  if (cleaned.length !== 9) return false;

  // SSA rules: cannot start with 000 or 666, or be 900-999
  const area = Number.parseInt(cleaned.substring(0, 3), 10);
  if (area === 0 || area === 666 || area >= 900) return false;

  // Group number cannot be 00
  const group = Number.parseInt(cleaned.substring(3, 5), 10);
  if (group === 0) return false;

  // Serial cannot be 0000
  const serial = Number.parseInt(cleaned.substring(5, 9), 10);
  if (serial === 0) return false;

  return true;
}

/**
 * Format SSN as "123-45-6789"
 */
export function formatSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length !== 9) return ssn;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * Get the last 4 digits of an encrypted SSN for searchability.
 * The last 4 digits are stored separately as a non-encrypted field
 * to enable searching by SSN last 4 without decrypting everything.
 */
export function getSSNLast4(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  return digits.slice(-4);
}
