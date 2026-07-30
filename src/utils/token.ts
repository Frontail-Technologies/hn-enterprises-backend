import { createHash, randomBytes } from "node:crypto";

export function generateSecureToken(byteLength = 48) {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
