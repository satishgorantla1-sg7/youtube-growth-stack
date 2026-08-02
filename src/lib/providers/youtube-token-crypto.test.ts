import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VersionedTokenCipher } from "./youtube-token-crypto";

const payload = { refreshToken: "refresh-secret", accessToken: "access-secret", accessTokenExpiresAt: "2026-08-02T01:00:00.000Z" };

function tamperCiphertext(envelope: string): string {
  const parts = envelope.split(".");
  const ciphertext = Buffer.from(parts.at(-1)!, "base64url");
  ciphertext[0] ^= 1;
  parts[parts.length - 1] = ciphertext.toString("base64url");
  return parts.join(".");
}

describe("VersionedTokenCipher", () => {
  it("round trips an authenticated envelope without plaintext credentials", () => {
    const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");
    const encrypted = cipher.encrypt(payload);
    expect(encrypted).toMatch(/^ygs1\.v1\./);
    expect(encrypted).not.toContain("refresh-secret");
    expect(cipher.decrypt(encrypted)).toEqual(payload);
  });

  it("supports decrypt-only old keys during rotation", () => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    const oldEnvelope = new VersionedTokenCipher(new Map([["v1", oldKey]]), "v1").encrypt(payload);
    const rotated = new VersionedTokenCipher(new Map([["v1", oldKey], ["v2", newKey]]), "v2");
    expect(rotated.decrypt(oldEnvelope)).toEqual(payload);
    expect(rotated.encrypt(payload)).toMatch(/^ygs1\.v2\./);
  });

  it("rejects tampering and unknown key versions", () => {
    const key = randomBytes(32);
    const cipher = new VersionedTokenCipher(new Map([["v1", key]]), "v1");
    const envelope = cipher.encrypt(payload);
    expect(() => cipher.decrypt(tamperCiphertext(envelope))).toThrow("token_decryption_failed");
    expect(() => new VersionedTokenCipher(new Map([["v2", randomBytes(32)]]), "v2").decrypt(envelope)).toThrow("unknown_token_key_version");
  });

  it("round trips an authenticated sync cursor without exposing its page token", () => {
    const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");
    const cursor = cipher.encryptPageToken("provider-page-token");
    expect(cursor).toEqual({
      encryptedPageToken: expect.stringMatching(/^ygc1\.v1\./),
      pageTokenVersion: 1,
    });
    expect(cursor.encryptedPageToken).not.toContain("provider-page-token");
    expect(cipher.decryptPageToken(cursor.encryptedPageToken, cursor.pageTokenVersion)).toBe("provider-page-token");
  });

  it("rejects cursor tampering and unsupported cursor formats", () => {
    const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");
    const cursor = cipher.encryptPageToken("provider-page-token");
    expect(() => cipher.decryptPageToken(tamperCiphertext(cursor.encryptedPageToken), 1)).toThrow("youtube_cursor_decryption_failed");
    expect(() => cipher.decryptPageToken(cursor.encryptedPageToken, 2)).toThrow("unknown_youtube_cursor_format");
  });
});
