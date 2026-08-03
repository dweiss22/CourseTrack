import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a secret (e.g. a Wrike permanent access token) at rest using
 * AES-256-GCM. Output format is base64url(iv):base64url(authTag):base64url(ciphertext).
 */
export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64url")).join(":");
}

/**
 * Decrypts a value produced by encryptSecret. Throws if the ciphertext was
 * tampered with (GCM authentication failure) or malformed.
 */
export function decryptSecret(encoded: string, encryptionKey: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted value.");
  }
  const [ivPart, authTagPart, ciphertextPart] = parts;
  const key = deriveKey(encryptionKey);
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
