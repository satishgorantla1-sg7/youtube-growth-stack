import { describe, expect, it } from "vitest";
import { youtubeSyncViewOverride } from "./connection-view";

const created_at = "2026-08-03T20:00:00.000Z";

describe("youtubeSyncViewOverride", () => {
  it("maps only the latest daily quota failure to quota limited", () => {
    expect(youtubeSyncViewOverride({ state: "failed", last_error_code: "youtube_daily_quota_exceeded", created_at }))
      .toBe("quota_limited");
    expect(youtubeSyncViewOverride({ state: "failed", last_error_code: "youtube_sync_failed", created_at }))
      .toBeNull();
  });

  it("shows queued and running work as refreshing", () => {
    expect(youtubeSyncViewOverride({ state: "queued", last_error_code: null, created_at })).toBe("refreshing");
    expect(youtubeSyncViewOverride({ state: "running", last_error_code: null, created_at })).toBe("refreshing");
  });

  it("naturally clears an older quota warning when the latest run succeeds", () => {
    expect(youtubeSyncViewOverride({ state: "completed", last_error_code: null, created_at })).toBeNull();
    expect(youtubeSyncViewOverride(null)).toBeNull();
  });
});
