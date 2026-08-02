import { z } from "zod";
import {
  DEFAULT_YOUTUBE_SYNC_BOUNDS,
  type YouTubeChannel,
  type YouTubeChannelSnapshot,
  type YouTubePage,
  type YouTubeSyncBounds,
  YouTubeSyncError,
  type YouTubeVideo,
  type YouTubeVideoSnapshot,
} from "./youtube-sync-contracts";

const nonNegativeInteger = z.coerce.number().int().nonnegative();
const nullableCount = z.string().optional().transform((value) => value === undefined ? null : nonNegativeInteger.parse(value));
const thumbnailSchema = z.record(z.string(), z.object({ url: z.string().url() }).passthrough()).optional();
const channelResponseSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    etag: z.string().optional(),
    snippet: z.object({
      title: z.string(), description: z.string().optional(), customUrl: z.string().optional(),
      publishedAt: z.string().datetime().optional(), country: z.string().optional(), thumbnails: thumbnailSchema,
    }),
    contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().optional() }) }).optional(),
    statistics: z.object({
      subscriberCount: nullableCount, viewCount: nullableCount, videoCount: nullableCount,
      hiddenSubscriberCount: z.boolean().optional(),
    }).optional(),
  }).passthrough()),
}).passthrough();
const playlistResponseSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string().min(1) }) }).passthrough()),
}).passthrough();
const videoResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1), etag: z.string().optional(),
    snippet: z.object({
      channelId: z.string().min(1), title: z.string(), description: z.string().optional(),
      publishedAt: z.string().datetime().optional(), thumbnails: thumbnailSchema,
      liveBroadcastContent: z.enum(["none", "upcoming", "live"]).optional(),
    }),
    contentDetails: z.object({ duration: z.string().optional() }).optional(),
    status: z.object({ privacyStatus: z.enum(["public", "unlisted", "private"]).optional() }).optional(),
    statistics: z.object({ viewCount: nullableCount, likeCount: nullableCount, commentCount: nullableCount }).optional(),
  }).passthrough()),
}).passthrough();

type Fetcher = (url: URL, init?: RequestInit) => Promise<Response>;
type Sleeper = (delayMs: number) => Promise<void>;
export type YouTubeAttemptGuard = (input: { url: URL; attempt: number }) => Promise<void>;

function bounded(input?: Partial<YouTubeSyncBounds>): YouTubeSyncBounds {
  const value = { ...DEFAULT_YOUTUBE_SYNC_BOUNDS, ...input };
  if (!Number.isInteger(value.maxPages) || value.maxPages < 1 || value.maxPages > 10) throw new YouTubeSyncError("youtube_invalid_page_limit", false);
  if (!Number.isInteger(value.maxItems) || value.maxItems < 1 || value.maxItems > 500) throw new YouTubeSyncError("youtube_invalid_item_limit", false);
  if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1_000 || value.timeoutMs > 30_000) throw new YouTubeSyncError("youtube_invalid_timeout", false);
  if (!Number.isInteger(value.maxRetries) || value.maxRetries < 0 || value.maxRetries > 3) throw new YouTubeSyncError("youtube_invalid_retry_limit", false);
  return value;
}

function thumbnailUrl(thumbnails: z.infer<typeof thumbnailSchema>): string | null {
  if (!thumbnails) return null;
  return thumbnails.maxres?.url ?? thumbnails.standard?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? null;
}

function parseDurationSeconds(duration?: string): number | null {
  if (!duration) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown, attemptedRequests: number): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new YouTubeSyncError("youtube_invalid_response", false, attemptedRequests);
  return parsed.data;
}

export class YouTubeReadOnlyProvider {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly sleep: Sleeper = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    private readonly baseUrl = "https://www.googleapis.com/youtube/v3",
    private readonly beforeRequest?: YouTubeAttemptGuard,
  ) {
    if (!accessToken.trim()) throw new YouTubeSyncError("youtube_access_token_required", false);
  }

  async listManagedChannels(input?: { pageToken?: string; bounds?: Partial<YouTubeSyncBounds>; requestKey?: string }): Promise<YouTubePage<{
    channel: YouTubeChannel; snapshot: YouTubeChannelSnapshot;
  }>> {
    const bounds = bounded(input?.bounds);
    const url = new URL(`${this.baseUrl}/channels`);
    url.searchParams.set("part", "id,snippet,contentDetails,statistics");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", String(Math.min(bounds.maxItems, 50)));
    if (input?.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const response = await this.request(url, bounds);
    const payload = parsePayload(channelResponseSchema, response.payload, response.attempts);
    const capturedAt = new Date().toISOString();
    return {
      items: payload.items.slice(0, bounds.maxItems).map((item) => ({
        channel: {
          externalId: item.id, title: item.snippet.title, description: item.snippet.description ?? null,
          handle: item.snippet.customUrl ?? null, thumbnailUrl: thumbnailUrl(item.snippet.thumbnails),
          uploadsPlaylistId: item.contentDetails?.relatedPlaylists.uploads ?? null,
          countryCode: item.snippet.country ?? null, publishedAt: item.snippet.publishedAt ?? null,
          etag: item.etag ?? null, accountKind: "unknown",
        },
        snapshot: {
          channelExternalId: item.id, subscriberCount: item.statistics?.subscriberCount ?? null,
          viewCount: item.statistics?.viewCount ?? null, videoCount: item.statistics?.videoCount ?? null,
          hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount ?? false,
          capturedAt, sourceEtag: item.etag ?? null,
        },
      })),
      nextPageToken: payload.nextPageToken ?? null,
      quota: { operation: "channels.list", units: response.attempts, requestIdempotencyKey: input?.requestKey ?? crypto.randomUUID() },
    };
  }

  async listUploadIds(input: { playlistId: string; pageToken?: string; bounds?: Partial<YouTubeSyncBounds>; requestKey?: string }): Promise<YouTubePage<string>> {
    const bounds = bounded(input.bounds);
    const url = new URL(`${this.baseUrl}/playlistItems`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", input.playlistId);
    url.searchParams.set("maxResults", String(Math.min(bounds.maxItems, 50)));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    const response = await this.request(url, bounds);
    const payload = parsePayload(playlistResponseSchema, response.payload, response.attempts);
    return {
      items: payload.items.slice(0, bounds.maxItems).map((item) => item.contentDetails.videoId),
      nextPageToken: payload.nextPageToken ?? null,
      quota: { operation: "playlistItems.list", units: response.attempts, requestIdempotencyKey: input.requestKey ?? crypto.randomUUID() },
    };
  }

  async listVideos(input: { videoIds: string[]; bounds?: Partial<YouTubeSyncBounds>; requestKey?: string }): Promise<YouTubePage<{
    video: YouTubeVideo; snapshot: YouTubeVideoSnapshot;
  }>> {
    const bounds = bounded(input.bounds);
    const ids = [...new Set(input.videoIds)].slice(0, Math.min(bounds.maxItems, 50));
    if (ids.length === 0) return { items: [], nextPageToken: null, quota: { operation: "videos.list", units: 0, requestIdempotencyKey: input.requestKey ?? crypto.randomUUID() } };
    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set("part", "id,snippet,contentDetails,status,statistics");
    url.searchParams.set("id", ids.join(","));
    url.searchParams.set("maxResults", String(ids.length));
    const response = await this.request(url, bounds);
    const payload = parsePayload(videoResponseSchema, response.payload, response.attempts);
    const capturedAt = new Date().toISOString();
    return {
      items: payload.items.map((item) => ({
        video: {
          externalId: item.id, channelExternalId: item.snippet.channelId, title: item.snippet.title,
          description: item.snippet.description ?? null, thumbnailUrl: thumbnailUrl(item.snippet.thumbnails),
          publishedAt: item.snippet.publishedAt ?? null, durationSeconds: parseDurationSeconds(item.contentDetails?.duration),
          privacyStatus: item.status?.privacyStatus ?? null,
          liveBroadcastContent: item.snippet.liveBroadcastContent ?? null, etag: item.etag ?? null,
        },
        snapshot: {
          videoExternalId: item.id, viewCount: item.statistics?.viewCount ?? null,
          likeCount: item.statistics?.likeCount ?? null, commentCount: item.statistics?.commentCount ?? null,
          capturedAt, sourceEtag: item.etag ?? null,
        },
      })),
      nextPageToken: null,
      quota: { operation: "videos.list", units: response.attempts, requestIdempotencyKey: input.requestKey ?? crypto.randomUUID() },
    };
  }

  private async request(url: URL, bounds: YouTubeSyncBounds): Promise<{ payload: unknown; attempts: number }> {
    for (let attempt = 0; attempt <= bounds.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), bounds.timeoutMs);
      try {
        await this.beforeRequest?.({ url: new URL(url), attempt: attempt + 1 });
        const response = await this.fetcher(url, {
          headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" },
          signal: controller.signal,
        });
        if (response.ok) return { payload: await response.json(), attempts: attempt + 1 };
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === bounds.maxRetries) throw new YouTubeSyncError(`youtube_http_${response.status}`, retryable, attempt + 1);
      } catch (error) {
        if (error instanceof YouTubeSyncError) throw error;
        if (attempt === bounds.maxRetries) throw new YouTubeSyncError("youtube_unavailable", true, attempt + 1);
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(Math.min(250 * 2 ** attempt, 1_000));
    }
    throw new YouTubeSyncError("youtube_unavailable", true, bounds.maxRetries + 1);
  }
}
