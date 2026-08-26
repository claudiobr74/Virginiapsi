// Pure, parameter-based crypto helpers (no ambient env access), which keeps
// them directly unit-testable. The "server-only" guard lives one layer up,
// on the modules that actually read GOOGLE_TOKEN_ENCRYPTION_KEY and talk to
// the database (connection.ts) — see docs/env split rationale in
// src/lib/env/schema.ts for the same pattern.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  // GOOGLE_TOKEN_ENCRYPTION_KEY is an operator-provided string of arbitrary
  // length; SHA-256 gives us a stable 32-byte key for AES-256 regardless of
  // the original secret's length/encoding.
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a Google OAuth token for storage in
 * `google_calendar_credentials`. Output is `iv:authTag:ciphertext`
 * (base64url segments) — self-contained so decryption never depends on
 * anything besides the key and this string.
 */
export function encryptToken(plainText: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((buffer) => buffer.toString("base64url"))
    .join(":");
}

export function decryptToken(encrypted: string, secret: string): string {
  const [ivPart, authTagPart, ciphertextPart] = encrypted.split(":");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("malformed encrypted token");
  }

  const key = deriveKey(secret);
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
