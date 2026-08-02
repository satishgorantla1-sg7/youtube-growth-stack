import { z } from "zod";
import type {
  YouTubeChannel,
  YouTubeChannelSnapshot,
  YouTubeQuotaCharge,
  YouTubeVideo,
  YouTubeVideoSnapshot,
} from "./youtube-sync-contracts";

const syncSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  connectionId: z.string().uuid(),
  channelId: z.string().uuid().nullable(),
  state: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  maxPages: z.number().int().min(1).max(10),
  maxItems: z.number().int().min(1).max(500),
  correlationId: z.string().uuid(),
  created: z.boolean().optional(),
  pagesFetched: z.number().int().min(0).max(10).optional(),
  itemsFetched: z.number().int().min(0).max(500).optional(),
  leaseToken: z.string().uuid().optional(),
  attemptCount: z.number().int().min(0).max(5).optional(),
});

export type YouTubeSyncRun = z.infer<typeof syncSchema>;

export type YouTubeSyncPage = {
  channels: Array<{ channel: YouTubeChannel; snapshot: YouTubeChannelSnapshot }>;
  videos: Array<{ video: YouTubeVideo; snapshot: YouTubeVideoSnapshot }>;
};

type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;
export type YouTubeSyncRpcClient = { rpc(name: string, args: Record<string, unknown>): RpcResult };

export interface YouTubeSyncRepository {
  begin(input: {
    workspaceId: string; connectionId: string; channelId?: string;
    idempotencyKey: string; maxPages: number; maxItems: number;
  }): Promise<YouTubeSyncRun>;
  lease(workerId: string, leaseSeconds: number): Promise<YouTubeSyncRun | null>;
  persistPage(run: YouTubeSyncRun, page: YouTubeSyncPage): Promise<{ pagesFetched: number; itemsFetched: number }>;
  recordQuota(run: YouTubeSyncRun, charge: YouTubeQuotaCharge): Promise<boolean>;
  finish(run: YouTubeSyncRun, result: {
    state: "completed" | "failed" | "cancelled"; pagesFetched: number; itemsFetched: number; errorCode?: string;
  }): Promise<void>;
}

const progressSchema = z.object({
  pagesFetched: z.number().int().min(0).max(10),
  itemsFetched: z.number().int().min(0).max(500),
});

function requireLease(run: YouTubeSyncRun): string {
  if (!run.leaseToken || run.state !== "running") throw new Error("youtube_sync_lease_required");
  return run.leaseToken;
}

function channelRow(item: YouTubeSyncPage["channels"][number]) {
  return {
    external_id: item.channel.externalId,
    title: item.channel.title,
    description: item.channel.description,
    handle: item.channel.handle,
    thumbnail_url: item.channel.thumbnailUrl,
    uploads_playlist_id: item.channel.uploadsPlaylistId,
    country_code: item.channel.countryCode,
    published_at: item.channel.publishedAt,
    etag: item.channel.etag,
    account_kind: item.channel.accountKind,
    subscriber_count: item.snapshot.subscriberCount,
    view_count: item.snapshot.viewCount,
    video_count: item.snapshot.videoCount,
    hidden_subscriber_count: item.snapshot.hiddenSubscriberCount,
    captured_at: item.snapshot.capturedAt,
  };
}

function videoRow(item: YouTubeSyncPage["videos"][number]) {
  return {
    external_id: item.video.externalId,
    channel_external_id: item.video.channelExternalId,
    title: item.video.title,
    description: item.video.description,
    thumbnail_url: item.video.thumbnailUrl,
    published_at: item.video.publishedAt,
    duration_seconds: item.video.durationSeconds,
    privacy_status: item.video.privacyStatus,
    live_broadcast_content: item.video.liveBroadcastContent,
    etag: item.video.etag,
    view_count: item.snapshot.viewCount,
    like_count: item.snapshot.likeCount,
    comment_count: item.snapshot.commentCount,
    captured_at: item.snapshot.capturedAt,
  };
}

export class SupabaseYouTubeSyncRepository implements YouTubeSyncRepository {
  constructor(private readonly client: YouTubeSyncRpcClient) {}

  async begin(input: {
    workspaceId: string; connectionId: string; channelId?: string;
    idempotencyKey: string; maxPages: number; maxItems: number;
  }): Promise<YouTubeSyncRun> {
    const { data, error } = await this.client.rpc("begin_youtube_sync", {
      target_workspace_id: input.workspaceId, target_connection_id: input.connectionId,
      target_channel_id: input.channelId, request_idempotency_key: input.idempotencyKey,
      request_max_pages: input.maxPages, request_max_items: input.maxItems,
    });
    if (error) throw new Error(error.message);
    return syncSchema.parse(data);
  }

  async lease(workerId: string, leaseSeconds: number): Promise<YouTubeSyncRun | null> {
    const { data, error } = await this.client.rpc("lease_youtube_sync", { worker_id: workerId, lease_seconds: leaseSeconds });
    if (error) throw new Error(error.message);
    return data === null ? null : syncSchema.parse(data);
  }

  async persistPage(run: YouTubeSyncRun, page: YouTubeSyncPage): Promise<{ pagesFetched: number; itemsFetched: number }> {
    const { data, error } = await this.client.rpc("persist_youtube_sync_page", {
      target_sync_run_id: run.id, target_lease_token: requireLease(run),
      channel_rows: page.channels.map(channelRow), video_rows: page.videos.map(videoRow),
    });
    if (error) throw new Error(error.message);
    return progressSchema.parse(data);
  }

  async recordQuota(run: YouTubeSyncRun, charge: YouTubeQuotaCharge): Promise<boolean> {
    if (charge.units === 0) return false;
    const { data, error } = await this.client.rpc("record_youtube_quota", {
      target_sync_run_id: run.id, target_lease_token: requireLease(run),
      target_operation: charge.operation, target_quota_units: charge.units,
      request_idempotency_key: charge.requestIdempotencyKey,
    });
    if (error) throw new Error(error.message);
    return z.boolean().parse(data);
  }

  async finish(run: YouTubeSyncRun, result: {
    state: "completed" | "failed" | "cancelled"; pagesFetched: number; itemsFetched: number; errorCode?: string;
  }): Promise<void> {
    const { error } = await this.client.rpc("finish_youtube_sync", {
      target_sync_run_id: run.id, target_lease_token: requireLease(run), target_state: result.state,
      target_pages_fetched: result.pagesFetched, target_items_fetched: result.itemsFetched,
      target_error_code: result.errorCode,
    });
    if (error) throw new Error(error.message);
  }
}
