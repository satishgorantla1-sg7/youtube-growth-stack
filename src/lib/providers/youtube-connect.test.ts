import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { beginYouTubeAuthorization, completeYouTubeAuthorization, SupabaseYouTubeOAuthRepository, SupabaseYouTubeProviderQuotaRepository, type YouTubeOAuthRepository, type YouTubeProviderQuotaRepository } from "./youtube-connect";
import { GoogleYouTubeOAuthProvider, YouTubeOAuthError, YOUTUBE_READONLY_SCOPE } from "./youtube-oauth";
import { VersionedTokenCipher } from "./youtube-token-crypto";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const approvalId = "00000000-0000-4000-8000-000000000003";
const state = "a".repeat(43);
const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://app.example/api/integrations/youtube/callback" };
const cipher = () => new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");

function repository(overrides: Partial<YouTubeOAuthRepository> = {}): YouTubeOAuthRepository {
  return { assertProviderEnabled: vi.fn().mockResolvedValue(undefined), createOAuthState: vi.fn().mockResolvedValue(undefined), consumeOAuthState: vi.fn().mockResolvedValue({ workspaceId, userId }), saveConnection: vi.fn().mockResolvedValue(undefined), ...overrides };
}
function quotaRepository(overrides: Partial<YouTubeProviderQuotaRepository> = {}): YouTubeProviderQuotaRepository {
  return { reserveOwnedChannelDiscovery: vi.fn().mockResolvedValue(undefined), ...overrides };
}

describe("YouTube OAuth connection", () => {
  it("checks the provider gate before binding a ten-minute approved state", async () => {
    const repo = repository();
    const result = await beginYouTubeAuthorization({ workspaceId, approvalId }, { repository: repo, provider: new GoogleYouTubeOAuthProvider(config), now: () => new Date("2026-08-02T00:00:00.000Z"), randomState: () => state });
    expect(result.ok).toBe(true);
    expect(repo.assertProviderEnabled).toHaveBeenCalledWith(workspaceId);
    expect(repo.createOAuthState).toHaveBeenCalledWith(workspaceId, approvalId, createHash("sha256").update(state).digest("hex"), "2026-08-02T00:10:00.000Z");
    expect(JSON.stringify(result)).not.toContain(config.clientSecret);
  });

  it("does not create state or expose a Google URL while disabled", async () => {
    const repo = repository({ assertProviderEnabled: vi.fn().mockRejectedValue(new Error("youtube_provider_disabled")) });
    const result = await beginYouTubeAuthorization({ workspaceId, approvalId }, { repository: repo, provider: new GoogleYouTubeOAuthProvider(config), randomState: () => state });
    expect(result).toEqual({ ok: false, status: 503, error: "youtube_provider_disabled" });
    expect(repo.createOAuthState).not.toHaveBeenCalled();
  });

  it.each(["oauth_state_expired", "oauth_state_replayed"])("rejects %s before token exchange", async (reason) => {
    const fetcher = vi.fn();
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), { repository: repository({ consumeOAuthState: vi.fn().mockRejectedValue(new Error(reason)) }), quotaRepository: quotaRepository(), provider: new GoogleYouTubeOAuthProvider(config, fetcher), cipher: cipher(), authenticatedUserId: userId });
    expect(result).toMatchObject({ ok: false, error: reason });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a state consumed by another user", async () => {
    const fetcher = vi.fn();
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), { repository: repository({ consumeOAuthState: vi.fn().mockResolvedValue({ workspaceId, userId: "00000000-0000-4000-8000-000000000099" }) }), quotaRepository: quotaRepository(), provider: new GoogleYouTubeOAuthProvider(config, fetcher), cipher: cipher(), authenticatedUserId: userId });
    expect(result).toMatchObject({ ok: false, status: 403, error: "oauth_state_user_mismatch" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rechecks the gate before exchanging the authorization code", async () => {
    const fetcher = vi.fn();
    const repo = repository({ assertProviderEnabled: vi.fn().mockRejectedValue(new Error("youtube_provider_disabled")) });
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), { repository: repo, quotaRepository: quotaRepository(), provider: new GoogleYouTubeOAuthProvider(config, fetcher), cipher: cipher(), authenticatedUserId: userId });
    expect(result).toEqual({ ok: false, status: 503, error: "youtube_provider_disabled" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reserves discovery quota before reading and stores only encrypted credentials", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600, scope: YOUTUBE_READONLY_SCOPE }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [
        { id: "UC123", snippet: { title: "Creator", customUrl: "@creator" }, contentDetails: { relatedPlaylists: { uploads: "UU123" } } },
        { id: "UC456", snippet: { title: "Brand", customUrl: "@brand" }, contentDetails: { relatedPlaylists: { uploads: "UU456" } } },
      ] }), { status: 200 }));
    const repo = repository();
    const quota = quotaRepository();
    const tokenCipher = cipher();
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "one-time-code" }), { repository: repo, quotaRepository: quota, provider: new GoogleYouTubeOAuthProvider(config, fetcher), cipher: tokenCipher, authenticatedUserId: userId });
    expect(result).toEqual({ ok: true, status: 200, workspaceId });
    expect(quota.reserveOwnedChannelDiscovery).toHaveBeenCalledWith(workspaceId, `yt-connect:${createHash("sha256").update(state).digest("hex")}`);
    const saved = vi.mocked(repo.saveConnection).mock.calls[0][0];
    expect(tokenCipher.decrypt(saved.encryptedCredentials).refreshToken).toBe("refresh-secret");
    expect(saved.channels).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/access-secret|refresh-secret/);
  });

  it("does not call the Data API when quota reservation is rejected and revokes the grant", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600, scope: YOUTUBE_READONLY_SCOPE }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), { repository: repository(), quotaRepository: quotaRepository({ reserveOwnedChannelDiscovery: vi.fn().mockRejectedValue(new Error("youtube_daily_quota_exceeded")) }), provider: new GoogleYouTubeOAuthProvider(config, fetcher), cipher: cipher(), authenticatedUserId: userId });
    expect(result).toEqual({ ok: false, status: 429, error: "youtube_daily_quota_exceeded" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("oauth2.googleapis.com/revoke");
  });

  it("returns a truthful safe outcome when post-exchange cleanup cannot be confirmed", async () => {
    const provider = new GoogleYouTubeOAuthProvider(config, vi.fn());
    vi.spyOn(provider, "exchangeCode").mockResolvedValue({ accessToken: "access-secret", refreshToken: "refresh-secret", accessTokenExpiresAt: "2026-08-02T01:00:00.000Z", scopes: [YOUTUBE_READONLY_SCOPE] });
    vi.spyOn(provider, "ownedChannels").mockRejectedValue(new YouTubeOAuthError("youtube_provider_unavailable", true));
    vi.spyOn(provider, "revoke").mockRejectedValue(new YouTubeOAuthError("youtube_provider_unavailable", true));
    const result = await completeYouTubeAuthorization(new URLSearchParams({ state, code: "code" }), { repository: repository(), quotaRepository: quotaRepository(), provider, cipher: cipher(), authenticatedUserId: userId });
    expect(result).toEqual({ ok: false, status: 503, error: "youtube_authorization_cleanup_unconfirmed" });
    expect(JSON.stringify(result)).not.toMatch(/access-secret|refresh-secret/);
  });

  it("sends bounded safe channels and discovery quota through typed RPC adapters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const adapter = new SupabaseYouTubeOAuthRepository({ rpc } as never);
    const quota = new SupabaseYouTubeProviderQuotaRepository({ rpc } as never);
    const channels = [{ externalId: "UC123", title: "Creator", handle: "@creator", thumbnailUrl: null, uploadsPlaylistId: "UU123" }];
    await adapter.saveConnection({ workspaceId, oauthStateHash: "b".repeat(64), encryptedCredentials: "ygs1.v1.iv.tag.ciphertext", credentialVersion: "v1", scopes: [YOUTUBE_READONLY_SCOPE], accessTokenExpiresAt: "2026-08-02T02:00:00.000Z", channels });
    await quota.reserveOwnedChannelDiscovery(workspaceId, "yt-connect:key-1234");
    expect(rpc).toHaveBeenCalledWith("store_youtube_connection", expect.objectContaining({ target_channels: channels }));
    expect(rpc).toHaveBeenCalledWith("reserve_youtube_provider_quota", expect.objectContaining({ target_workspace_id: workspaceId, target_operation: "channels.list", target_quota_units: 1 }));
  });
});
