import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { getDb } from "../db";
import { userApiCredentials } from "../db/schema";
import { runtime } from "./runtime";

function bytesToBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> { const raw = atob(value); const bytes = new Uint8Array(new ArrayBuffer(raw.length)); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; }

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = runtime("USER_API_KEY_ENCRYPTION_KEY");
  if (!encoded) throw new Error("个人 API Key 加密服务尚未配置");
  const bytes = base64ToBytes(encoded);
  if (bytes.length !== 32) throw new Error("个人 API Key 加密配置无效");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function savePersonalDeepSeekKey(userId: string, apiKey: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, await encryptionKey(), new TextEncoder().encode(apiKey));
  await getDb().insert(userApiCredentials).values({ userId, encryptedKey: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: userApiCredentials.userId, set: { encryptedKey: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv), updatedAt: new Date().toISOString() } });
}

export async function getPersonalDeepSeekKey(userId: string): Promise<string | null> {
  const rows = await getDb().select().from(userApiCredentials).where(eq(userApiCredentials.userId, userId)).limit(1);
  const row = rows[0]; if (!row) return null;
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(row.iv), additionalData: new TextEncoder().encode(userId) }, await encryptionKey(), base64ToBytes(row.encryptedKey));
  return new TextDecoder().decode(plain);
}

export async function personalDeepSeekStatus(userId: string) {
  const rows = await getDb().select({ updatedAt: userApiCredentials.updatedAt }).from(userApiCredentials).where(eq(userApiCredentials.userId, userId)).limit(1);
  return { configured: Boolean(rows[0]), updatedAt: rows[0]?.updatedAt || null };
}

export async function deletePersonalDeepSeekKey(userId: string) {
  await getDb().delete(userApiCredentials).where(eq(userApiCredentials.userId, userId));
}

export async function resolveDeepSeekKey(): Promise<string> {
  const user = await getChatGPTUser().catch(() => null);
  if (user) {
    const personal = await getPersonalDeepSeekKey(user.userId);
    if (personal) return personal;
  }
  return runtime("DEEPSEEK_API_KEY");
}

export async function hasDeepSeekKey(): Promise<boolean> { return Boolean(await resolveDeepSeekKey()); }
