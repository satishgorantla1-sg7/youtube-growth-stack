import { describe, expect, it, vi } from "vitest";
import { SupabaseYouTubeSyncRepository, type YouTubeSyncRpcClient, type YouTubeSyncRun } from "./youtube-sync-repository";

const running: YouTubeSyncRun = {
  id: "10000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000002",
  connectionId: "10000000-0000-4000-8000-000000000003",
  channelId: "10000000-0000-4000-8000-000000000004",
  correlationId: "10000000-0000-4000-8000-000000000005",
  state: "running", maxPages: 3, maxItems: 100,
  pagesFetched: 0, itemsFetched: 0, attemptCount: 1,
  leaseToken: "10000000-0000-4000-8000-000000000006",
};

describe("SupabaseYouTubeSyncRepository", () => {
  it("creates idempotent bounded syncs through the server RPC", async () => {
    const rpc = vi.fn(async () => ({ data: { ...running, state: "queued", created: true }, error: null }));
    const repository = new SupabaseYouTubeSyncRepository({ rpc } as YouTubeSyncRpcClient);
    const result = await repository.begin({
      workspaceId: running.workspaceId, connectionId: running.connectionId,
      channelId: running.channelId ?? undefined, idempotencyKey: "sync-request-1", maxPages: 3, maxItems: 100,
    });
    expect(result.created).toBe(true);
    expect(rpc).toHaveBeenCalledWith("begin_youtube_sync", expect.objectContaining({
      request_idempotency_key: "sync-request-1", request_max_pages: 3, request_max_items: 100,
    }));
  });

  it("normalizes page data before the atomic persistence RPC", async () => {
    const rpc = vi.fn(async () => ({ data: { pagesFetched: 1, itemsFetched: 2 }, error: null }));
    const repository = new SupabaseYouTubeSyncRepository({ rpc } as YouTubeSyncRpcClient);
    const progress = await repository.persistPage(running, {
      channels: [{
        channel: { externalId: "UC-one", title: "One", description: null, handle: "@one", thumbnailUrl: null, uploadsPlaylistId: "UU-one", countryCode: "GB", publishedAt: null, etag: "c1", accountKind: "unknown" },
        snapshot: { channelExternalId: "UC-one", subscriberCount: 1, viewCount: 2, videoCount: 3, hiddenSubscriberCount: false, capturedAt: "2026-08-01T00:00:00Z", sourceEtag: "c1" },
      }],
      videos: [{
        video: { externalId: "video-one", channelExternalId: "UC-one", title: "Video", description: null, thumbnailUrl: null, publishedAt: null, durationSeconds: 60, privacyStatus: "public", liveBroadcastContent: "none", etag: "v1" },
        snapshot: { videoExternalId: "video-one", viewCount: 4, likeCount: 1, commentCount: 0, capturedAt: "2026-08-01T00:00:00Z", sourceEtag: "v1" },
      }],
    });
    expect(progress).toEqual({ pagesFetched: 1, itemsFetched: 2 });
    expect(rpc).toHaveBeenCalledWith("persist_youtube_sync_page", expect.objectContaining({
      target_sync_run_id: running.id, target_lease_token: running.leaseToken,
      channel_rows: [expect.objectContaining({ external_id: "UC-one", subscriber_count: 1 })],
      video_rows: [expect.objectContaining({ external_id: "video-one", view_count: 4 })],
    }));
  });

  it("records quota idempotently and skips zero-unit local no-ops", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const repository = new SupabaseYouTubeSyncRepository({ rpc } as YouTubeSyncRpcClient);
    await expect(repository.recordQuota(running, { operation: "videos.list", units: 1, requestIdempotencyKey: "quota-1" })).resolves.toBe(true);
    await expect(repository.recordQuota(running, { operation: "videos.list", units: 0, requestIdempotencyKey: "quota-empty" })).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses persistence and completion without an active lease", async () => {
    const rpc = vi.fn();
    const repository = new SupabaseYouTubeSyncRepository({ rpc } as YouTubeSyncRpcClient);
    const queued = { ...running, state: "queued" as const, leaseToken: undefined };
    await expect(repository.persistPage(queued, { channels: [], videos: [] })).rejects.toThrow("youtube_sync_lease_required");
    await expect(repository.finish(queued, { state: "failed", pagesFetched: 0, itemsFetched: 0 })).rejects.toThrow("youtube_sync_lease_required");
    expect(rpc).not.toHaveBeenCalled();
  });
});
