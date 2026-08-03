import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GoogleYouTubeOAuthProvider, YOUTUBE_READONLY_SCOPE } from "./youtube-oauth";
import { VersionedTokenCipher } from "./youtube-token-crypto";
import { YouTubeTokenLifecycle } from "./youtube-token-lifecycle";
import type { YouTubeTokenLifecycleRepository } from "./youtube-connection-repository";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const approvalId = "00000000-0000-4000-8000-000000000003";
const now = Date.parse("2026-08-02T00:00:00.000Z");
const config = { clientId: "id", clientSecret: "secret", redirectUri: "https://app.example/callback" };

function fixture(accessTokenExpiresAt = "2026-08-02T00:00:00.000Z") {
  const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");
  const encryptedCredentials = cipher.encrypt({ refreshToken: "refresh-secret", accessToken: "old-access", accessTokenExpiresAt });
  const repository: YouTubeTokenLifecycleRepository = {
    acquireRefreshLease: vi.fn().mockResolvedValue({ workspaceId, leaseToken: "lease", encryptedCredentials, credentialVersion: "v1" }),
    completeRefresh: vi.fn().mockResolvedValue(undefined),
    requireReconnect: vi.fn().mockResolvedValue(undefined),
    acquireRevocationLease: vi.fn().mockResolvedValue({ workspaceId, leaseToken: "lease", encryptedCredentials, credentialVersion: "v1" }),
    completeRevocation: vi.fn().mockResolvedValue(undefined),
  };
  return { cipher, encryptedCredentials, repository };
}

function lifecycle(repository: YouTubeTokenLifecycleRepository, cipher: VersionedTokenCipher, fetcher = vi.fn()) {
  return new YouTubeTokenLifecycle(repository, new GoogleYouTubeOAuthProvider(config, fetcher), cipher);
}

function refreshedResponse() {
  return new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600, scope: YOUTUBE_READONLY_SCOPE }), { status: 200 });
}

describe("YouTubeTokenLifecycle", () => {
  it("uses a token with more than five minutes remaining without refreshing", async () => {
    const { cipher, encryptedCredentials, repository } = fixture("2026-08-02T00:05:01.000Z");
    const fetcher = vi.fn();
    await expect(lifecycle(repository, cipher, fetcher).accessForSync(workspaceId, encryptedCredentials, now)).resolves.toMatchObject({
      accessToken: "old-access", encryptedCredentials, refreshed: false,
    });
    expect(repository.acquireRefreshLease).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", "2026-08-01T23:59:59.000Z"],
    ["near expiry", "2026-08-02T00:05:00.000Z"],
  ])("refreshes an %s access token before sync", async (_label, expiresAt) => {
    const { cipher, encryptedCredentials, repository } = fixture(expiresAt);
    const fetcher = vi.fn().mockResolvedValue(refreshedResponse());
    const result = await lifecycle(repository, cipher, fetcher).accessForSync(workspaceId, encryptedCredentials, now);
    expect(result).toMatchObject({ accessToken: "new-access", refreshed: true });
    expect(result.encryptedCredentials).not.toBe(encryptedCredentials);
    expect(cipher.decrypt(result.encryptedCredentials)).toMatchObject({ refreshToken: "refresh-secret", accessToken: "new-access" });
    expect(repository.completeRefresh).toHaveBeenCalledOnce();
  });

  it("fails sync safely instead of using a stale token when refresh is locked", async () => {
    const { cipher, encryptedCredentials, repository } = fixture();
    vi.mocked(repository.acquireRefreshLease).mockResolvedValue(null);
    const fetcher = vi.fn();
    await expect(lifecycle(repository, cipher, fetcher).accessForSync(workspaceId, encryptedCredentials, now))
      .rejects.toMatchObject({ code: "youtube_token_refresh_locked", retryable: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails sync on a transient refresh error without changing connection state", async () => {
    const { cipher, encryptedCredentials, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(lifecycle(repository, cipher, fetcher).accessForSync(workspaceId, encryptedCredentials, now))
      .rejects.toMatchObject({ code: "youtube_provider_unavailable", retryable: true });
    expect(repository.completeRefresh).not.toHaveBeenCalled();
    expect(repository.requireReconnect).not.toHaveBeenCalled();
  });

  it("marks the connection reconnect-required and blocks sync on invalid_grant", async () => {
    const { cipher, encryptedCredentials, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(lifecycle(repository, cipher, fetcher).accessForSync(workspaceId, encryptedCredentials, now))
      .rejects.toMatchObject({ code: "youtube_reconnect_required", retryable: false });
    expect(repository.requireReconnect).toHaveBeenCalledWith(workspaceId, expect.any(String), "youtube_reconnect_required");
    expect(repository.completeRefresh).not.toHaveBeenCalled();
  });

  it("does not return a rotated token when local refresh completion fails", async () => {
    const { cipher, encryptedCredentials, repository } = fixture();
    vi.mocked(repository.completeRefresh).mockRejectedValue(new Error("youtube_token_lifecycle_storage_failed"));
    const fetcher = vi.fn().mockResolvedValue(refreshedResponse());
    await expect(lifecycle(repository, cipher, fetcher).accessForSync(workspaceId, encryptedCredentials, now))
      .rejects.toThrow("youtube_token_lifecycle_storage_failed");
  });

  it("does not refresh when another worker holds the lease", async () => {
    const { cipher, repository } = fixture();
    vi.mocked(repository.acquireRefreshLease).mockResolvedValue(null);
    const fetcher = vi.fn();
    await expect(lifecycle(repository, cipher, fetcher).refresh(workspaceId)).resolves.toEqual({ status: "locked" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("atomically completes a successful refresh with a newly encrypted token", async () => {
    const { cipher, repository } = fixture();
    const result = await lifecycle(repository, cipher, vi.fn().mockResolvedValue(refreshedResponse())).refresh(workspaceId);
    expect(result.status).toBe("refreshed");
    const encrypted = vi.mocked(repository.completeRefresh).mock.calls[0][2];
    expect(cipher.decrypt(encrypted)).toMatchObject({ refreshToken: "refresh-secret", accessToken: "new-access" });
  });

  it("revokes at Google before marking local credentials revoked", async () => {
    const { cipher, repository } = fixture();
    await expect(lifecycle(repository, cipher, vi.fn().mockResolvedValue(new Response(null, { status: 200 }))).revoke(workspaceId, approvalId))
      .resolves.toEqual({ status: "revoked" });
    expect(repository.completeRevocation).toHaveBeenCalledOnce();
  });

  it("converges locally when Google reports the token is already invalid", async () => {
    const { cipher, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 }));
    await expect(lifecycle(repository, cipher, fetcher).revoke(workspaceId, approvalId)).resolves.toEqual({ status: "revoked" });
    expect(repository.completeRevocation).toHaveBeenCalledOnce();
  });

  it("retains local credentials when Google revocation fails transiently", async () => {
    const { cipher, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(lifecycle(repository, cipher, fetcher).revoke(workspaceId, approvalId))
      .rejects.toMatchObject({ code: "youtube_provider_unavailable", retryable: true });
    expect(repository.completeRevocation).not.toHaveBeenCalled();
  });

  it("surfaces local revocation completion failure so the retained lease can be retried", async () => {
    const { cipher, repository } = fixture();
    vi.mocked(repository.completeRevocation).mockRejectedValue(new Error("youtube_token_lifecycle_storage_failed"));
    await expect(lifecycle(repository, cipher, vi.fn().mockResolvedValue(new Response(null, { status: 200 }))).revoke(workspaceId, approvalId))
      .rejects.toThrow("youtube_token_lifecycle_storage_failed");
  });
});
