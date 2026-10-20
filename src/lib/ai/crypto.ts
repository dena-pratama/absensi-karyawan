import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AI_ENCRYPTION_KEY: 32 byte (base64), dipakai untuk
 * - mengenkripsi API key provider AI sebelum disimpan di DB (AES-256-GCM)
 * - menandatangani proposal perubahan data dari AI (HMAC-SHA256)
 */
function masterKey(): Buffer {
  const raw = process.env.AI_ENCRYPTION_KEY;
  if (!raw) throw new Error("AI_ENCRYPTION_KEY belum diisi di .env.local.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("AI_ENCRYPTION_KEY harus 32 byte (base64).");
  return key;
}

export const isAiKeyConfigured = () => {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
};

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const hmac = (body: string) => createHmac("sha256", masterKey()).update(`ai-proposal:${body}`).digest("base64url");

/** Token = base64url(json).signature */
export function signPayload(value: unknown): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyPayload<T>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
