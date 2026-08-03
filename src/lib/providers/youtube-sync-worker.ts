import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { SupabaseYouTubeTokenLifecycleRepository } from "./youtube-connection-repository";
import { GoogleYouTubeOAuthProvider, readYouTubeOAuthConfig, YouTubeOAuthError } from "./youtube-oauth";
import { type YouTubeQuotaCharge, YouTubeSyncError } from "./youtube-sync-contracts";
import { YouTubeReadOnlyProvider, type YouTubeAttemptGuard } from "./youtube-sync-provider";
import {
  SupabaseYouTubeSyncRepository,
  type YouTubeSyncLease,
  type YouTubeSyncPage,
  type YouTubeSyncRepository,
  type YouTubeSyncRpcClient,
} from "./youtube-sync-repository";
import { YouTubeTokenLifecycle } from "./youtube-token-lifecycle";
import { readTokenCipher, type VersionedTokenCipher } from "./youtube-token-crypto";

type SyncResult = "idle" | "completed" | "failed" | "lease_lost";
type SyncProvider = Pick<YouTubeReadOnlyProvider, "listManagedChannels" | "listUploadIds" | "listVideos">;
type ProviderFactory = (accessToken: string, beforeRequest: YouTubeAttemptGuard) => SyncProvider;
type SyncTokenLifecycle = Pick<YouTubeTokenLifecycle, "accessForSync">;

const LEASE_SECONDS = 180;
const SAFE_CONTROL_CODES = [
  "youtube_sync_disabled",
  "provider_daily_quota_exceeded",
  "workspace_daily_quota_exceeded",
  "provider_rate_limit_exceeded",
] as const;
const SAFE_LIFECYCLE_CODES = [
  "youtube_token_refresh_locked",
  "youtube_provider_unavailable",
  "youtube_reconnect_required",
] as const;

function operationFor(url: URL): YouTubeQuotaCharge["operation"] {
  if (url.pathname.endsWith("/channels")) return "channels.list";
  if (url.pathname.endsWith("/playlistItems")) return "playlistItems.list";
  if (url.pathname.endsWith("/videos")) return "videos.list";
  throw new YouTubeSyncError("youtube_unknown_operation", false);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof YouTubeSyncError) {
    return error.code === "youtube_http_401" ? "youtube_reconnect_required" : error.code;
  }
  if (error instanceof YouTubeOAuthError) {
    return SAFE_LIFECYCLE_CODES.find((code) => code === error.code) ?? "youtube_sync_failed";
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("invalid_or_expired_sync_lease") || message.includes("youtube_sync_lease_required")) return "lease_lost";
  if (["token_decryption_failed", "unknown_token_key_version", "invalid_token_envelope", "youtube_credential_version_mismatch", "youtube_cursor_decryption_failed", "unknown_youtube_cursor_format", "invalid_youtube_cursor_envelope"].some((code) => message.includes(code))) {
    return "youtube_reconnect_required";
  }
  return SAFE_CONTROL_CODES.find((code) => message.includes(code)) ?? "youtube_sync_failed";
}

function assertCredentialVersion(lease: YouTubeSyncLease): void {
  const envelopeVersion = lease.encryptedCredentials.split(".")[1];
  if (envelopeVersion !== lease.credentialVersion) throw new Error("youtube_credential_version_mismatch");
}

function defaultProvider(accessToken: string, beforeRequest: YouTubeAttemptGuard): SyncProvider {
  return new YouTubeReadOnlyProvider(accessToken, fetch, undefined, undefined, beforeRequest);
}

export async function runYouTubeSyncOnce(
  repository: YouTubeSyncRepository,
  cipher: VersionedTokenCipher,
  workerId: string,
  tokenLifecycle: SyncTokenLifecycle,
  createProvider: ProviderFactory = defaultProvider,
): Promise<SyncResult> {
  const lease = await repository.lease(workerId, LEASE_SECONDS);
  if (!lease) return "idle";

  let pagesFetched = lease.pagesFetched ?? 0;
  let itemsFetched = lease.itemsFetched ?? 0;
  let requestSequence = 0;
  const beforeRequest: YouTubeAttemptGuard = async ({ url, attempt }) => {
    const operation = operationFor(url);
    requestSequence += 1;
    await repository.recordQuota(lease, {
      operation,
      units: 1,
      requestIdempotencyKey: `yt:${lease.id}:${lease.attemptCount}:${operation}:${requestSequence}:a${attempt}`,
    });
  };

  try {
    if (lease.cursorInitialized && (lease.encryptedPageToken === null || lease.pageTokenVersion === null)) {
      await repository.finish(lease, { state: "completed", pagesFetched, itemsFetched });
      return "completed";
    }
    assertCredentialVersion(lease);
    const access = await tokenLifecycle.accessForSync(lease.workspaceId, lease.encryptedCredentials);
    const provider = createProvider(access.accessToken, beforeRequest);
    let pageToken: string | undefined;
    let pendingChannel: YouTubeSyncPage["channels"][number] | undefined;
    if (lease.cursorInitialized) {
      pageToken = cipher.decryptPageToken(lease.encryptedPageToken!, lease.pageTokenVersion!);
    } else {
      if (pagesFetched > 0) throw new YouTubeSyncError("youtube_sync_cursor_invalid", false);
      const channelPage = await provider.listManagedChannels({
        channelId: lease.channelExternalId,
        bounds: { maxPages: 1, maxItems: 1 },
        requestKey: `${lease.id}:channel`,
      });
      const selected = channelPage.items.find(({ channel }) => channel.externalId === lease.channelExternalId);
      if (!selected) throw new YouTubeSyncError("youtube_selected_channel_unavailable", false);
      if (selected.channel.uploadsPlaylistId && selected.channel.uploadsPlaylistId !== lease.uploadsPlaylistId) {
        throw new YouTubeSyncError("youtube_uploads_playlist_mismatch", false);
      }
      pendingChannel = selected;
    }
    while (pagesFetched < lease.maxPages && itemsFetched < lease.maxItems) {
      const remainingItems = lease.maxItems - itemsFetched;
      const channelUnits = pendingChannel ? 1 : 0;
      const videoCapacity = Math.max(0, remainingItems - channelUnits);
      let nextPageToken: string | null = null;
      const videoItems: YouTubeSyncPage["videos"] = [];

      if (videoCapacity > 0) {
        const uploadPage = await provider.listUploadIds({
          playlistId: lease.uploadsPlaylistId,
          pageToken,
          bounds: { maxPages: 1, maxItems: Math.min(videoCapacity, 50) },
          requestKey: `${lease.id}:uploads:${pagesFetched + 1}`,
        });
        nextPageToken = uploadPage.nextPageToken;
        const uploadIds = [...new Set(uploadPage.items)].slice(0, videoCapacity);
        for (let offset = 0; offset < uploadIds.length; offset += 50) {
          const batch = uploadIds.slice(offset, offset + 50);
          const videos = await provider.listVideos({
            videoIds: batch,
            bounds: { maxPages: 1, maxItems: Math.min(batch.length, 50) },
            requestKey: `${lease.id}:videos:${pagesFetched + 1}:${offset / 50}`,
          });
          if (videos.items.some(({ video }) => video.channelExternalId !== lease.channelExternalId)) {
            throw new YouTubeSyncError("youtube_cross_channel_response", false);
          }
          videoItems.push(...videos.items);
        }
      }

      const cursor = nextPageToken
        ? cipher.encryptPageToken(nextPageToken)
        : { encryptedPageToken: null, pageTokenVersion: null };
      const progress = await repository.persistPage(lease, {
        channels: pendingChannel ? [pendingChannel] : [],
        videos: videoItems.slice(0, videoCapacity),
      }, { ...cursor, cursorInitialized: true });
      pagesFetched = progress.pagesFetched;
      itemsFetched = progress.itemsFetched;
      pendingChannel = undefined;
      if (!nextPageToken || videoCapacity === 0) break;
      pageToken = nextPageToken;
    }

    await repository.finish(lease, { state: "completed", pagesFetched, itemsFetched });
    return "completed";
  } catch (error) {
    const code = safeErrorCode(error);
    if (code === "lease_lost") return "lease_lost";
    try {
      await repository.finish(lease, { state: "failed", pagesFetched, itemsFetched, errorCode: code });
      return "failed";
    } catch (finishError) {
      if (safeErrorCode(finishError) === "lease_lost") return "lease_lost";
      throw finishError;
    }
  }
}

export function createProductionYouTubeSyncDependencies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  const oauthConfig = readYouTubeOAuthConfig(process.env);
  const cipher = readTokenCipher();
  if (!url || !key || !oauthConfig || !cipher) throw new Error("youtube_worker_configuration_missing");
  const client = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    repository: new SupabaseYouTubeSyncRepository(client as unknown as YouTubeSyncRpcClient),
    cipher,
    tokenLifecycle: new YouTubeTokenLifecycle(
      new SupabaseYouTubeTokenLifecycleRepository(client as never),
      new GoogleYouTubeOAuthProvider(oauthConfig),
      cipher,
    ),
  };
}

export async function runProductionYouTubeSyncOnce(workerId: string): Promise<SyncResult> {
  const dependencies = createProductionYouTubeSyncDependencies();
  return runYouTubeSyncOnce(dependencies.repository, dependencies.cipher, workerId, dependencies.tokenLifecycle);
}
