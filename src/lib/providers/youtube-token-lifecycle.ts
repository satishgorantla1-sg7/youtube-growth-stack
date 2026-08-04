import { newLeaseToken, type YouTubeTokenLifecycleRepository } from "./youtube-connection-repository";
import { GoogleYouTubeOAuthProvider, YouTubeOAuthError } from "./youtube-oauth";
import { VersionedTokenCipher } from "./youtube-token-crypto";

const SYNC_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type YouTubeSyncAccess = {
  accessToken: string;
  encryptedCredentials: string;
  expiresAt: string;
  refreshed: boolean;
};

export class YouTubeTokenLifecycle {
  constructor(private readonly repository: YouTubeTokenLifecycleRepository, private readonly provider: GoogleYouTubeOAuthProvider, private readonly cipher: VersionedTokenCipher, private readonly leaseMs = 30_000) {}

  async accessForSync(workspaceId: string, encryptedCredentials: string, now = Date.now()): Promise<YouTubeSyncAccess> {
    const current = this.cipher.decrypt(encryptedCredentials);
    if (new Date(current.accessTokenExpiresAt).getTime() - now > SYNC_REFRESH_WINDOW_MS) {
      return { accessToken: current.accessToken, encryptedCredentials, expiresAt: current.accessTokenExpiresAt, refreshed: false };
    }
    const result = await this.refresh(workspaceId);
    if (result.status === "locked") {
      throw new YouTubeOAuthError("youtube_token_refresh_locked", true);
    }
    if (result.status === "reconnect_required") {
      throw new YouTubeOAuthError("youtube_reconnect_required");
    }
    return { accessToken: result.accessToken, encryptedCredentials: result.encryptedCredentials, expiresAt: result.expiresAt, refreshed: true };
  }

  async refresh(workspaceId: string) {
    const leaseToken = newLeaseToken();
    const lease = await this.repository.acquireRefreshLease(workspaceId, leaseToken, new Date(Date.now() + this.leaseMs).toISOString());
    if (!lease) return { status: "locked" as const };
    const current = this.cipher.decrypt(lease.encryptedCredentials);
    try {
      const refreshed = await this.provider.refresh(current.refreshToken);
      const encrypted = this.cipher.encrypt({ refreshToken: refreshed.refreshToken ?? current.refreshToken, accessToken: refreshed.accessToken, accessTokenExpiresAt: refreshed.accessTokenExpiresAt });
      await this.repository.completeRefresh(workspaceId, leaseToken, encrypted, this.cipher.activeVersion, refreshed.accessTokenExpiresAt);
      return { status: "refreshed" as const, accessToken: refreshed.accessToken, encryptedCredentials: encrypted, expiresAt: refreshed.accessTokenExpiresAt };
    } catch (error) {
      if (error instanceof YouTubeOAuthError && error.code === "youtube_reconnect_required") {
        await this.repository.requireReconnect(workspaceId, leaseToken, error.code);
        return { status: "reconnect_required" as const };
      }
      // The bounded lease expires naturally. Transient failures must not turn a valid grant into a reconnect requirement.
      throw error;
    }
  }

  async revoke(workspaceId: string, approvalId: string) {
    const parsedApprovalId = zUuid(approvalId);
    const leaseToken = newLeaseToken();
    const lease = await this.repository.acquireRevocationLease(workspaceId, parsedApprovalId, leaseToken, new Date(Date.now() + this.leaseMs).toISOString());
    if (!lease) return { status: "locked" as const };
    const current = this.cipher.decrypt(lease.encryptedCredentials);
    try {
      await this.provider.revoke(current.refreshToken);
    } catch (error) {
      if (!(error instanceof YouTubeOAuthError) || error.code !== "youtube_token_already_invalid") {
        throw error;
      }
    }
    await this.repository.completeRevocation(workspaceId, leaseToken);
    return { status: "revoked" as const };
  }
}

function zUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("approval_required");
  return value;
}
