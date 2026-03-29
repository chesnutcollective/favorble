import { authenticator } from "otplib";

export function generateTOTPCode(secret: string): string {
  return authenticator.generate(secret);
}

export function verifyTOTPCode(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}
