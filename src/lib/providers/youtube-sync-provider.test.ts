import { describe, expect, it, vi } from "vitest";
import { YouTubeReadOnlyProvider } from "./youtube-sync-provider";
import { YouTubeSyncError } from "./youtube-sync-contracts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("YouTubeReadOnlyProvider", () => {
  it("normalizes multiple owned channels without guessing Brand ownership", async () => {
    const fetcher = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: "Bearer server-token", Accept: "application/json" });
      return jsonResponse({ items: [
        { id: "UC-one", etag: "etag-one", snippet: { title: "One", customUrl: "@one", thumbnails: { high: { url: "https://img.test/one" } } }, contentDetails: { relatedPlaylists: { uploads: "UU-one" } }, statistics: { subscriberCount: "12", viewCount: "100", videoCount: "3" } },
        { id: "UC-brand", snippet: { title: "Brand" }, statistics: { hiddenSubscriberCount: true } },
      ] });
    });
    const result = await new YouTubeReadOnlyProvider("server-token", fetcher).listManagedChannels({ requestKey: "channels-1" });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].channel).toMatchObject({ externalId: "UC-one", uploadsPlaylistId: "UU-one", accountKind: "unknown" });
    expect(result.items[0].snapshot).toMatchObject({ subscriberCount: 12, viewCount: 100, videoCount: 3 });
    expect(result.items[1].channel.accountKind).toBe("unknown");
    expect(result.items[1].snapshot.hiddenSubscriberCount).toBe(true);
    expect(result.quota).toEqual({ operation: "channels.list", units: 1, requestIdempotencyKey: "channels-1" });
  });

  it("passes bounded pagination to upload playlist reads", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("pageToken")).toBe("next-safe-page");
      expect(url.searchParams.get("maxResults")).toBe("25");
      return jsonResponse({ nextPageToken: "another-page", items: [
        { contentDetails: { videoId: "video-1" } }, { contentDetails: { videoId: "video-2" } },
      ] });
    });
    const result = await new YouTubeReadOnlyProvider("token", fetcher).listUploadIds({
      playlistId: "UU-one", pageToken: "next-safe-page", bounds: { maxItems: 25 }, requestKey: "uploads-1",
    });
    expect(result.items).toEqual(["video-1", "video-2"]);
    expect(result.nextPageToken).toBe("another-page");
  });

  it("reads only the selected channel when an external id is supplied", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("id")).toBe("UC-selected");
      expect(url.searchParams.has("mine")).toBe(false);
      return jsonResponse({ items: [{
        id: "UC-selected", snippet: { title: "Selected" },
        contentDetails: { relatedPlaylists: { uploads: "UU-selected" } },
      }] });
    });
    const result = await new YouTubeReadOnlyProvider("token", fetcher).listManagedChannels({ channelId: "UC-selected" });
    expect(result.items.map((item) => item.channel.externalId)).toEqual(["UC-selected"]);
  });

  it("deduplicates and normalizes a bounded video batch", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("id")).toBe("video-1,video-2");
      return jsonResponse({ items: [{
        id: "video-1", etag: "etag-v1",
        snippet: { channelId: "UC-one", title: "Video One", publishedAt: "2026-08-01T00:00:00Z", liveBroadcastContent: "none" },
        contentDetails: { duration: "PT1H2M3S" }, status: { privacyStatus: "public" },
        statistics: { viewCount: "99", likeCount: "7", commentCount: "2" },
      }] });
    });
    const result = await new YouTubeReadOnlyProvider("token", fetcher).listVideos({
      videoIds: ["video-1", "video-1", "video-2"], requestKey: "videos-1",
    });
    expect(result.items[0].video).toMatchObject({ externalId: "video-1", durationSeconds: 3723, privacyStatus: "public" });
    expect(result.items[0].snapshot).toMatchObject({ viewCount: 99, likeCount: 7, commentCount: 2 });
    expect(result.quota.units).toBe(1);
  });

  it("backs off only for bounded retryable failures", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const sleep = vi.fn(async () => undefined);
    const result = await new YouTubeReadOnlyProvider("token", fetcher, sleep).listManagedChannels({ bounds: { maxRetries: 1 } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.quota.units).toBe(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("maps non-retryable failures without exposing the access token", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: { message: "sensitive" } }, 403));
    const operation = new YouTubeReadOnlyProvider("never-log-this", fetcher).listManagedChannels();
    await expect(operation).rejects.toEqual(expect.objectContaining<Partial<YouTubeSyncError>>({ code: "youtube_http_403", retryable: false, attemptedRequests: 1 }));
    await expect(operation).rejects.not.toThrow("never-log-this");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe pagination, item, timeout, and retry bounds", async () => {
    const provider = new YouTubeReadOnlyProvider("token", vi.fn());
    await expect(provider.listManagedChannels({ bounds: { maxItems: 501 } })).rejects.toThrow("youtube_invalid_item_limit");
    await expect(provider.listManagedChannels({ bounds: { maxPages: 11 } })).rejects.toThrow("youtube_invalid_page_limit");
    await expect(provider.listManagedChannels({ bounds: { timeoutMs: 31_000 } })).rejects.toThrow("youtube_invalid_timeout");
    await expect(provider.listManagedChannels({ bounds: { maxRetries: 4 } })).rejects.toThrow("youtube_invalid_retry_limit");
  });
});
