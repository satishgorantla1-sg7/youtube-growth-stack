import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const tokenPayloadSchema = z.object({
  refreshToken: z.string().min(1), accessToken: z.string().min(1), accessTokenExpiresAt: z.string().datetime(),
});
export type YouTubeTokenPayload = z.infer<typeof tokenPayloadSchema>;

export class VersionedTokenCipher {
  constructor(private readonly keys: ReadonlyMap<string, Buffer>, readonly activeVersion: string) {
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(activeVersion)) throw new Error("invalid_token_key_version");
    const key = keys.get(activeVersion);
    if (!key || key.byteLength !== 32) throw new Error("invalid_token_encryption_key");
  }
  encrypt(payload: YouTubeTokenPayload) {
    const validated = tokenPayloadSchema.parse(payload);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.activeVersion)!, iv);
    cipher.setAAD(Buffer.from(`youtube-oauth:${this.activeVersion}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(validated), "utf8"), cipher.final()]);
    return ["ygs1", this.activeVersion, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }
  encryptPageToken(pageToken: string): { encryptedPageToken: string; pageTokenVersion: 1 } {
    if (!pageToken || pageToken.length > 4_096) throw new Error("invalid_youtube_page_token");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.activeVersion)!, iv);
    cipher.setAAD(Buffer.from(`youtube-sync-cursor:${this.activeVersion}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(pageToken, "utf8"), cipher.final()]);
    return {
      encryptedPageToken: ["ygc1", this.activeVersion, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join("."),
      pageTokenVersion: 1,
    };
  }
  decryptPageToken(envelope: string, pageTokenVersion: number): string {
    if (pageTokenVersion !== 1) throw new Error("unknown_youtube_cursor_format");
    const [format, version, ivValue, tagValue, ciphertextValue, extra] = envelope.split(".");
    if (format !== "ygc1" || !version || !ivValue || !tagValue || !ciphertextValue || extra) throw new Error("invalid_youtube_cursor_envelope");
    const key = this.keys.get(version);
    if (!key) throw new Error("unknown_token_key_version");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
      decipher.setAAD(Buffer.from(`youtube-sync-cursor:${version}`, "utf8"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      const pageToken = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
      if (!pageToken || pageToken.length > 4_096) throw new Error("invalid_youtube_page_token");
      return pageToken;
    } catch { throw new Error("youtube_cursor_decryption_failed"); }
  }
  decrypt(envelope: string): YouTubeTokenPayload {
    const [format, version, ivValue, tagValue, ciphertextValue, extra] = envelope.split(".");
    if (format !== "ygs1" || !version || !ivValue || !tagValue || !ciphertextValue || extra) throw new Error("invalid_token_envelope");
    const key = this.keys.get(version);
    if (!key) throw new Error("unknown_token_key_version");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
      decipher.setAAD(Buffer.from(`youtube-oauth:${version}`, "utf8"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
      return tokenPayloadSchema.parse(JSON.parse(plaintext));
    } catch { throw new Error("token_decryption_failed"); }
  }
}

export function readTokenCipher(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = z.object({
    YOUTUBE_TOKEN_ENCRYPTION_KEY: z.string().min(1),
    YOUTUBE_TOKEN_ENCRYPTION_KEY_VERSION: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).default("v1"),
    YOUTUBE_TOKEN_DECRYPTION_KEYS: z.string().optional(),
  }).safeParse(environment);
  if (!parsed.success) return null;
  try {
    const keys = new Map<string, Buffer>();
    keys.set(parsed.data.YOUTUBE_TOKEN_ENCRYPTION_KEY_VERSION, decodeKey(parsed.data.YOUTUBE_TOKEN_ENCRYPTION_KEY));
    if (parsed.data.YOUTUBE_TOKEN_DECRYPTION_KEYS) {
      const oldKeys = z.record(z.string(), z.string()).parse(JSON.parse(parsed.data.YOUTUBE_TOKEN_DECRYPTION_KEYS));
      for (const [version, value] of Object.entries(oldKeys)) keys.set(version, decodeKey(value));
    }
    return new VersionedTokenCipher(keys, parsed.data.YOUTUBE_TOKEN_ENCRYPTION_KEY_VERSION);
  } catch { return null; }
}

function decodeKey(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) throw new Error("invalid_token_encryption_key");
  return key;
}
