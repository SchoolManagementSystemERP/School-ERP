import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for sensitive columns (Student.sensitive, Staff.sensitive, Staff.bankAccount).
 * AES-256-GCM with a random IV per value; stored as "v1:<base64(iv | tag | ciphertext)>".
 * The key comes from DATA_ENCRYPTION_KEY (32 bytes, base64) and never reaches the database,
 * so a stolen backup or a database administrator cannot read Aadhaar or bank details.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set (see .env.example).");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function decryptJson<T = Record<string, unknown>>(stored: string | null | undefined): T | null {
  if (!stored) return null;
  const [version, payload] = stored.split(":", 2);
  if (version !== VERSION || !payload) throw new Error("Unknown encrypted value format.");
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

/** Adds / replaces fields in an encrypted JSON value. */
export function mergeEncrypted(stored: string | null | undefined, patch: Record<string, unknown>): string {
  return encryptJson({ ...(decryptJson(stored) ?? {}), ...patch });
}
