import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { beginYouTubeAuthorization, completeYouTubeAuthorization, SupabaseYouTubeOAuthRepository, type YouTubeOAuthRepository } from "./youtube-connect";
import { GoogleYouTubeOAuthProvider, YOUTUBE_READONLY_SCOPE } from "./youtube-oauth";
import { VersionedTokenCipher } from "./youtube-token-crypto";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const approvalId = "00000000-0000-4000-8000-000000000003";
const state = "a".repeat(43);
const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/api/integrations/youtube/callback" };

function repository(overrides: Partial<YouTubeOAuthRepository> = {}): YouTubeOAuthRepository {
  return {
    createOAuthState: vi.fn().mockResolvedValue(undefined),
    consumeOAuthState: vi.fn().mockResolvedValue({ workspaceId, userId }),
    saveConnection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("YouTube OAuth connection", () => {
  it("binds a ten-minute state hash to workspace and an approved credential action", async () => {
    const repo = repository();
    const result = await beginYouTubeAuthorization({ workspaceId, approvalId }, {
      repository: repo,
      provider: new GoogleYouTubeOAuthProvider(config),
      now: () => new Date("2026-08-02T00:00:00.000Z"),
      randomState: () => state,
    });
    expect(result.ok).toBe(true);
    expect(repo.createOAuthState).toHaveBeenCalledWith(workspaceId, approvalId, createHash("sha256").update(state).digest("hex"), "2026-08-02T00:10:00.000Z");
    expect(JSON.stringify(result)).not.toContain(config.clientSecret);
  });

  it.each(["oauth_state_expired", "oauth_state_replayed"])("rejects %s before token exchange", async (reason) => {
    const repo = repository({ consumeOAuthState: vi.fn().mockRejectedValue(new Error(reason)) });
    const provider = new GoogleYouTubeOAuthProvider(config, vi.fn());
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), {
      repository: repo, provider, cipher: new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1"), authenticatedUserId: userId,
    });
    expect(result).toMatchObject({ ok: false, error: reason });
  });

  it("rejects a state consumed by another user", async () => {
    const repo = repository({ consumeOAuthState: vi.fn().mockResolvedValue({ workspaceId, userId: "00000000-0000-4000-8000-000000000099" }) });
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), {
      repository: repo, provider: new GoogleYouTubeOAuthProvider(config, vi.fn()), cipher: new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1"), authenticatedUserId: userId,
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: "oauth_state_user_mismatch" });
  });

  it("stores only encrypted credentials and a safe array after resolving owned channels", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600, scope: YOUTUBE_READONLY_SCOPE }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [
        { id: "UC123", snippet: { title: "Creator", customUrl: "@creator" }, contentDetails: { relatedPlaylists: { uploads: "UU123" } } },
        { id: "UC456", snippet: { title: "Brand", customUrl: "@brand" }, contentDetails: { relatedPlaylists: { uploads: "UU456" } } },
      ] }), { status: 200 }));
    const repo = repository();
    const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "one-time-code" }), {
      repository: repo, provider: new GoogleYouTubeOAuthProvider(config, fetcher), cipher, authenticatedUserId: userId,
    });
    expect(result).toEqual({ ok: true, status: 200, workspaceId });
    const saved = vi.mocked(repo.saveConnection).mock.calls[0][0];
    expect(saved.encryptedCredentials).not.toContain("refresh-secret");
    expect(cipher.decrypt(saved.encryptedCredentials).refreshToken).toBe("refresh-secret");
    expect(saved.channels).toEqual([
      { externalId: "UC123", title: "Creator", handle: "@creator", thumbnailUrl: null, uploadsPlaylistId: "UU123" },
      { externalId: "UC456", title: "Brand", handle: "@brand", thumbnailUrl: null, uploadsPlaylistId: "UU456" },
    ]);
    expect(saved).not.toHaveProperty("channel");
    expect(saved.oauthStateHash).toBe(createHash("sha256").update(state).digest("hex"));
    expect(JSON.stringify(result)).not.toContain("access-secret");
  });

  it("sends the bounded safe channel array through target_channels", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const adapter = new SupabaseYouTubeOAuthRepository({ rpc } as never);
    const channels = [
      { externalId: "UC123", title: "Creator", handle: "@creator", thumbnailUrl: null, uploadsPlaylistId: "UU123" },
      { externalId: "UC456", title: "Brand", handle: "@brand", thumbnailUrl: "https://img.example/brand.jpg", uploadsPlaylistId: "UU456" },
    ];
    await adapter.saveConnection({
      workspaceId,
      oauthStateHash: "b".repeat(64),
      encryptedCredentials: "ygs1.v1.iv.tag.ciphertext",
      credentialVersion: "v1",
      scopes: [YOUTUBE_READONLY_SCOPE],
      accessTokenExpiresAt: "2026-08-02T02:00:00.000Z",
      channels,
    });
    expect(rpc).toHaveBeenCalledWith("store_youtube_connection", expect.objectContaining({
      target_channels: channels,
    }));
    const args = rpc.mock.calls[0][1];
    expect(args).not.toHaveProperty("target_external_id");
    expect(args).not.toHaveProperty("target_title");
  });
});
