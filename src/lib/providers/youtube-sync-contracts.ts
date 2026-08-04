export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly" as const;

export type YouTubeChannel = {
  externalId: string;
  title: string;
  description: string | null;
  handle: string | null;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string | null;
  countryCode: string | null;
  publishedAt: string | null;
  etag: string | null;
  accountKind: "unknown" | "personal" | "brand";
};

export type YouTubeChannelSnapshot = {
  channelExternalId: string;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  hiddenSubscriberCount: boolean;
  capturedAt: string;
  sourceEtag: string | null;
};

export type YouTubeVideo = {
  externalId: string;
  channelExternalId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  privacyStatus: "public" | "unlisted" | "private" | null;
  liveBroadcastContent: "none" | "upcoming" | "live" | null;
  etag: string | null;
};

export type YouTubeVideoSnapshot = {
  videoExternalId: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  capturedAt: string;
  sourceEtag: string | null;
};

export type YouTubeQuotaCharge = {
  operation: "channels.list" | "playlistItems.list" | "videos.list";
  units: number;
  requestIdempotencyKey: string;
};

export type YouTubePage<T> = {
  items: T[];
  nextPageToken: string | null;
  quota: YouTubeQuotaCharge;
};

export type YouTubeSyncBounds = {
  maxPages: number;
  maxItems: number;
  timeoutMs: number;
  maxRetries: number;
};

export const DEFAULT_YOUTUBE_SYNC_BOUNDS: Readonly<YouTubeSyncBounds> = {
  maxPages: 5,
  maxItems: 250,
  timeoutMs: 15_000,
  maxRetries: 2,
};

export class YouTubeSyncError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly attemptedRequests = 0,
  ) {
    super(code);
    this.name = "YouTubeSyncError";
  }
}
