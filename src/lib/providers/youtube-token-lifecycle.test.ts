import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GoogleYouTubeOAuthProvider, YOUTUBE_READONLY_SCOPE } from "./youtube-oauth";
import { VersionedTokenCipher } from "./youtube-token-crypto";
import { YouTubeTokenLifecycle } from "./youtube-token-lifecycle";
import type { YouTubeTokenLifecycleRepository } from "./youtube-connection-repository";

const workspaceId = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");
  const encryptedCredentials = cipher.encrypt({ refreshToken: "refresh-secret", accessToken: "old-access", accessTokenExpiresAt: "2026-08-02T00:00:00.000Z" });
  const repository: YouTubeTokenLifecycleRepository = {
    acquireRefreshLease: vi.fn().mockResolvedValue({ workspaceId, leaseToken: "lease", encryptedCredentials, credentialVersion: "v1" }),
    completeRefresh: vi.fn().mockResolvedValue(undefined), requireReconnect: vi.fn().mockResolvedValue(undefined),
    acquireRevocationLease: vi.fn().mockResolvedValue({ workspaceId, leaseToken: "lease", encryptedCredentials, credentialVersion: "v1" }),
    completeRevocation: vi.fn().mockResolvedValue(undefined),
  };
  return { cipher, repository };
}

describe("YouTubeTokenLifecycle", () => {
  it("does not refresh when another worker holds the lease", async () => {
    const { cipher, repository } = fixture();
    vi.mocked(repository.acquireRefreshLease).mockResolvedValue(null);
    const fetcher = vi.fn();
    await expect(new YouTubeTokenLifecycle(repository, new GoogleYouTubeOAuthProvider({ clientId: "id", clientSecret: "secret", redirectUri: "https://app.example/callback" }, fetcher), cipher).refresh(workspaceId)).resolves.toEqual({ status: "locked" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("atomically completes a successful refresh with a newly encrypted token", async () => {
    const { cipher, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600, scope: YOUTUBE_READONLY_SCOPE }), { status: 200 }));
    const result = await new YouTubeTokenLifecycle(repository, new GoogleYouTubeOAuthProvider({ clientId: "id", clientSecret: "secret", redirectUri: "https://app.example/callback" }, fetcher), cipher).refresh(workspaceId);
    expect(result.status).toBe("refreshed");
    const encrypted = vi.mocked(repository.completeRefresh).mock.calls[0][2];
    expect(cipher.decrypt(encrypted)).toMatchObject({ refreshToken: "refresh-secret", accessToken: "new-access" });
  });

  it("marks the connection reconnect-required on invalid_grant", async () => {
    const { cipher, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(new YouTubeTokenLifecycle(repository, new GoogleYouTubeOAuthProvider({ clientId: "id", clientSecret: "secret", redirectUri: "https://app.example/callback" }, fetcher), cipher).refresh(workspaceId)).resolves.toEqual({ status: "reconnect_required" });
    expect(repository.requireReconnect).toHaveBeenCalledWith(workspaceId, expect.any(String), "youtube_reconnect_required");
  });

  it("revokes at Google before marking local credentials revoked", async () => {
    const { cipher, repository } = fixture();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(new YouTubeTokenLifecycle(repository, new GoogleYouTubeOAuthProvider({ clientId: "id", clientSecret: "secret", redirectUri: "https://app.example/callback" }, fetcher), cipher).revoke(workspaceId, "00000000-0000-4000-8000-000000000003")).resolves.toEqual({ status: "revoked" });
    expect(repository.completeRevocation).toHaveBeenCalledOnce();
  });
});
