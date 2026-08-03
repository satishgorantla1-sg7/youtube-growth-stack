import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { YouTubeOAuthError } from "./youtube-oauth";
import { YouTubeSyncError } from "./youtube-sync-contracts";
import { YouTubeReadOnlyProvider, type YouTubeAttemptGuard } from "./youtube-sync-provider";
import type { YouTubeSyncLease, YouTubeSyncPage, YouTubeSyncRepository } from "./youtube-sync-repository";
import { VersionedTokenCipher } from "./youtube-token-crypto";
import { runYouTubeSyncOnce } from "./youtube-sync-worker";

const cipher = new VersionedTokenCipher(new Map([["v1", randomBytes(32)]]), "v1");

function lease(overrides: Partial<YouTubeSyncLease> = {}): YouTubeSyncLease {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    workspaceId: "10000000-0000-4000-8000-000000000002",
    connectionId: "10000000-0000-4000-8000-000000000003",
    channelId: "10000000-0000-4000-8000-000000000004",
    correlationId: "10000000-0000-4000-8000-000000000005",
    leaseToken: "10000000-0000-4000-8000-000000000006",
    state: "running",
    maxPages: 3,
    maxItems: 100,
    pagesFetched: 0,
    itemsFetched: 0,
    attemptCount: 1,
    encryptedCredentials: cipher.encrypt({
      refreshToken: "refresh-secret",
      accessToken: "access-secret",
      accessTokenExpiresAt: "2026-08-02T12:00:00.000Z",
    }),
    credentialVersion: "v1",
    channelExternalId: "UC-selected",
    uploadsPlaylistId: "UU-selected",
    encryptedPageToken: null,
    pageTokenVersion: null,
    cursorInitialized: false,
    ...overrides,
  };
}

function repository(activeLease: YouTubeSyncLease | null, overrides: Partial<YouTubeSyncRepository> = {}) {
  let pages = activeLease?.pagesFetched ?? 0;
  let items = activeLease?.itemsFetched ?? 0;
  const repo: YouTubeSyncRepository = {
    begin: vi.fn(async () => { throw new Error("not_used"); }),
    lease: vi.fn(async () => activeLease),
    persistPage: vi.fn(async (_run, page) => {
      pages += 1;
      items += page.channels.length + page.videos.length;
      return { pagesFetched: pages, itemsFetched: items };
    }),
    recordQuota: vi.fn(async () => true),
    finish: vi.fn(async () => undefined),
    ...overrides,
  };
  return repo;
}

function selectedChannel() {
  return {
    channel: {
      externalId: "UC-selected", title: "Selected", description: null, handle: "@selected",
      thumbnailUrl: null, uploadsPlaylistId: "UU-selected", countryCode: null, publishedAt: null,
      etag: null, accountKind: "unknown" as const,
    },
    snapshot: {
      channelExternalId: "UC-selected", subscriberCount: 10, viewCount: 20, videoCount: 30,
      hiddenSubscriberCount: false, capturedAt: "2026-08-02T00:00:00.000Z", sourceEtag: null,
    },
  };
}

function video(id: string) {
  return {
    video: {
      externalId: id, channelExternalId: "UC-selected", title: id, description: null,
      thumbnailUrl: null, publishedAt: null, durationSeconds: 60, privacyStatus: "public" as const,
      liveBroadcastContent: "none" as const, etag: null,
    },
    snapshot: {
      videoExternalId: id, viewCount: 1, likeCount: 1, commentCount: 0,
      capturedAt: "2026-08-02T00:00:00.000Z", sourceEtag: null,
    },
  };
}

function tokenLifecycle(accessToken = "access-secret") {
  return {
    accessForSync: vi.fn(async (_workspaceId: string, encryptedCredentials: string) => ({
      accessToken,
      encryptedCredentials,
      expiresAt: "2026-08-02T12:00:00.000Z",
      refreshed: accessToken !== "access-secret",
    })),
  };
}

function providerFactory(options: { pages?: string[][]; fail?: YouTubeSyncError; expectedToken?: string } = {}) {
  const batches: string[][] = [];
  const pageTokens: Array<string | undefined> = [];
  let pageIndex = 0;
  const factory = vi.fn((token: string, guard: YouTubeAttemptGuard) => ({
    listManagedChannels: vi.fn(async () => {
      expect(token).toBe(options.expectedToken ?? "access-secret");
      await guard({ url: new URL("https://www.googleapis.com/youtube/v3/channels"), attempt: 1 });
      if (options.fail) throw options.fail;
      return { items: [selectedChannel()], nextPageToken: null, quota: { operation: "channels.list" as const, units: 1, requestIdempotencyKey: "ignored" } };
    }),
    listUploadIds: vi.fn(async ({ pageToken }: { pageToken?: string }) => {
      pageTokens.push(pageToken);
      await guard({ url: new URL("https://www.googleapis.com/youtube/v3/playlistItems"), attempt: 1 });
      const pages = options.pages ?? [["v1"]];
      const items = pages[pageIndex] ?? [];
      pageIndex += 1;
      return { items, nextPageToken: pageIndex < pages.length ? `page-${pageIndex}` : null, quota: { operation: "playlistItems.list" as const, units: 1, requestIdempotencyKey: "ignored" } };
    }),
    listVideos: vi.fn(async ({ videoIds }: { videoIds: string[] }) => {
      await guard({ url: new URL("https://www.googleapis.com/youtube/v3/videos"), attempt: 1 });
      batches.push(videoIds);
      return { items: videoIds.map(video), nextPageToken: null, quota: { operation: "videos.list" as const, units: 1, requestIdempotencyKey: "ignored" } };
    }),
  }));
  return { factory, batches, pageTokens };
}

describe("runYouTubeSyncOnce", () => {
  it("does not construct a provider when the queue is idle", async () => {
    const repo = repository(null);
    const provider = providerFactory();
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), provider.factory)).resolves.toBe("idle");
    expect(provider.factory).not.toHaveBeenCalled();
    expect(repo.recordQuota).not.toHaveBeenCalled();
  });

  it("obtains a lifecycle-vetted fresh token before provider construction", async () => {
    const active = lease({ maxPages: 1, maxItems: 2 });
    const repo = repository(active);
    const lifecycle = tokenLifecycle();
    const provider = providerFactory();
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", lifecycle, provider.factory)).resolves.toBe("completed");
    expect(lifecycle.accessForSync).toHaveBeenCalledWith(active.workspaceId, active.encryptedCredentials);
    expect(provider.factory).toHaveBeenCalledWith("access-secret", expect.any(Function));
    expect(repo.recordQuota).toHaveBeenCalledTimes(3);
  });

  it.each(["near-expiry", "expired"])("uses the refreshed token for a %s credential", async () => {
    const active = lease({ maxPages: 1, maxItems: 2 });
    const repo = repository(active);
    const lifecycle = tokenLifecycle("refreshed-access");
    const provider = providerFactory({ expectedToken: "refreshed-access" });
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", lifecycle, provider.factory)).resolves.toBe("completed");
    expect(provider.factory).toHaveBeenCalledWith("refreshed-access", expect.any(Function));
    expect(JSON.stringify(vi.mocked(provider.factory).mock.calls)).not.toContain("access-secret");
  });

  it.each([
    ["locked refresh", new YouTubeOAuthError("youtube_token_refresh_locked", true), "youtube_token_refresh_locked"],
    ["transient refresh failure", new YouTubeOAuthError("youtube_provider_unavailable", true), "youtube_provider_unavailable"],
    ["invalid grant", new YouTubeOAuthError("youtube_reconnect_required"), "youtube_reconnect_required"],
  ])("blocks provider construction after %s", async (_label, error, safeCode) => {
    const active = lease();
    const repo = repository(active);
    const lifecycle = { accessForSync: vi.fn().mockRejectedValue(error) };
    const provider = providerFactory();
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", lifecycle, provider.factory)).resolves.toBe("failed");
    expect(provider.factory).not.toHaveBeenCalled();
    expect(repo.recordQuota).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(active, {
      state: "failed",
      pagesFetched: 0,
      itemsFetched: 0,
      errorCode: safeCode,
    });
  });

  it("syncs only the selected channel with bounded pages and atomic persistence", async () => {
    const active = lease({ maxPages: 2, maxItems: 10 });
    const repo = repository(active);
    const provider = providerFactory({ pages: [["v1"], ["v2"]] });
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), provider.factory)).resolves.toBe("completed");
    expect(repo.persistPage).toHaveBeenCalledTimes(2);
    const firstPage = vi.mocked(repo.persistPage).mock.calls[0][1] as YouTubeSyncPage;
    const secondPage = vi.mocked(repo.persistPage).mock.calls[1][1] as YouTubeSyncPage;
    expect(firstPage.channels.map((item) => item.channel.externalId)).toEqual(["UC-selected"]);
    expect(secondPage.channels).toEqual([]);
    expect(repo.finish).toHaveBeenCalledWith(active, expect.objectContaining({ state: "completed", pagesFetched: 2, itemsFetched: 3 }));
  });

  it("never sends more than 50 ids in one videos.list batch", async () => {
    const ids = Array.from({ length: 75 }, (_, index) => `video-${index}`);
    const active = lease({ maxPages: 1, maxItems: 80 });
    const repo = repository(active);
    const provider = providerFactory({ pages: [ids] });
    await runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), provider.factory);
    expect(provider.batches.map((batch) => batch.length)).toEqual([50, 25]);
    expect(provider.batches.flat()).toHaveLength(75);
  });

  it("records one quota unit before every attempt, including failed retries", async () => {
    const active = lease({ maxPages: 1, maxItems: 2 });
    const repo = repository(active);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [selectedChannelToApi()] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const factory = (token: string, guard: YouTubeAttemptGuard) => new YouTubeReadOnlyProvider(token, fetcher, vi.fn(async () => undefined), undefined, guard);
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), factory)).resolves.toBe("failed");
    expect(repo.recordQuota).toHaveBeenCalledTimes(5);
    expect(vi.mocked(repo.recordQuota).mock.calls.every(([, charge]) => charge.units === 1)).toBe(true);
    expect(new Set(vi.mocked(repo.recordQuota).mock.calls.map(([, charge]) => charge.requestIdempotencyKey)).size).toBe(5);
  });

  it("finishes provider failures with a safe code and never logs credentials", async () => {
    const active = lease();
    const repo = repository(active);
    const provider = providerFactory({ fail: new YouTubeSyncError("youtube_http_401", false, 1) });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), provider.factory)).resolves.toBe("failed");
    expect(repo.finish).toHaveBeenCalledWith(active, expect.objectContaining({ state: "failed", errorCode: "youtube_reconnect_required" }));
    expect(JSON.stringify(vi.mocked(repo.finish).mock.calls)).not.toContain("access-secret");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("resumes from the atomically persisted cursor without replaying earlier pages", async () => {
    const cursor = cipher.encryptPageToken("resume-page-2");
    const active = lease({ pagesFetched: 1, itemsFetched: 2, cursorInitialized: true, ...cursor });
    const repo = repository(active);
    const provider = providerFactory({ pages: [["v2"]] });
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), provider.factory)).resolves.toBe("completed");
    expect(provider.pageTokens).toEqual(["resume-page-2"]);
    const createdProvider = provider.factory.mock.results[0].value;
    expect(createdProvider.listManagedChannels).not.toHaveBeenCalled();
    expect(repo.persistPage).toHaveBeenCalledTimes(1);
    expect(repo.finish).toHaveBeenCalledWith(active, expect.objectContaining({ pagesFetched: 2, itemsFetched: 3 }));
  });

  it("finishes a terminal persisted cursor after lease loss without refetching", async () => {
    const active = lease({ pagesFetched: 1, itemsFetched: 2, cursorInitialized: true });
    const repo = repository(active);
    const provider = providerFactory();
    const lifecycle = tokenLifecycle();
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", lifecycle, provider.factory)).resolves.toBe("completed");
    expect(lifecycle.accessForSync).not.toHaveBeenCalled();
    expect(provider.factory).not.toHaveBeenCalled();
    expect(repo.persistPage).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(active, { state: "completed", pagesFetched: 1, itemsFetched: 2 });
  });

  it("stops without a stale completion write when the lease is lost", async () => {
    const active = lease();
    const repo = repository(active, { persistPage: vi.fn(async () => { throw new Error("invalid_or_expired_sync_lease"); }) });
    const provider = providerFactory();
    await expect(runYouTubeSyncOnce(repo, cipher, "worker-1", tokenLifecycle(), provider.factory)).resolves.toBe("lease_lost");
    expect(repo.finish).not.toHaveBeenCalled();
  });
});

function selectedChannelToApi() {
  return {
    id: "UC-selected",
    snippet: { title: "Selected" },
    contentDetails: { relatedPlaylists: { uploads: "UU-selected" } },
    statistics: {},
  };
}
