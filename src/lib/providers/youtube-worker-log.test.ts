import { describe, expect, it } from "vitest";
import { safeYouTubeWorkerErrorCode } from "./youtube-worker-log";

describe("safeYouTubeWorkerErrorCode", () => {
  it("preserves only allowlisted operational codes", () => {
    expect(safeYouTubeWorkerErrorCode(new Error("youtube_provider_disabled"))).toBe("youtube_provider_disabled");
  });

  it("redacts arbitrary database, provider, and credential detail", () => {
    expect(safeYouTubeWorkerErrorCode(new Error("refresh-secret database failure"))).toBe("youtube_worker_iteration_failed");
    expect(safeYouTubeWorkerErrorCode({ token: "secret" })).toBe("youtube_worker_iteration_failed");
  });
});
