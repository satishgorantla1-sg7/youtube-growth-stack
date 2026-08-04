import { describe, expect, it } from "vitest";
import { youtubeSyncExecutionState } from "./sync-execution";

const now = new Date("2026-08-03T20:05:00.000Z");
const row = { state: "queued", last_error_code: null, created_at: "2026-08-03T20:04:00.000Z", lease_expires_at: null };

describe("youtubeSyncExecutionState", () => {
  it("keeps a fresh durable queue truthful even before a worker is seen", () => {
    expect(youtubeSyncExecutionState(row, { status: "not_seen", lastSeenAt: null }, now)).toBe("queued");
  });

  it("marks an old queue stalled when no healthy worker is polling", () => {
    expect(youtubeSyncExecutionState({ ...row, created_at: "2026-08-03T20:02:59.000Z" }, { status: "stale", lastSeenAt: "2026-08-03T20:00:00.000Z" }, now)).toBe("stalled");
  });

  it("marks running work stalled after the lease or heartbeat expires", () => {
    const running = { ...row, state: "running", lease_expires_at: "2026-08-03T20:04:59.000Z" };
    expect(youtubeSyncExecutionState(running, { status: "healthy", lastSeenAt: "2026-08-03T20:04:55.000Z" }, now)).toBe("stalled");
    expect(youtubeSyncExecutionState({ ...running, lease_expires_at: "2026-08-03T20:08:00.000Z" }, { status: "stale", lastSeenAt: "2026-08-03T20:00:00.000Z" }, now)).toBe("stalled");
  });

  it("distinguishes active, complete, and failed execution", () => {
    const healthy = { status: "healthy" as const, lastSeenAt: "2026-08-03T20:04:55.000Z" };
    expect(youtubeSyncExecutionState({ ...row, state: "running", lease_expires_at: "2026-08-03T20:08:00.000Z" }, healthy, now)).toBe("running");
    expect(youtubeSyncExecutionState({ ...row, state: "completed" }, healthy, now)).toBe("complete");
    expect(youtubeSyncExecutionState({ ...row, state: "failed" }, healthy, now)).toBe("failed");
  });
});
