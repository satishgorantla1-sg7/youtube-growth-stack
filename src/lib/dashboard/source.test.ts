import { describe, expect, it, vi } from "vitest";
import { SupabaseDashboardDataSource } from "./source";

describe("SupabaseDashboardDataSource.latestYoutubeSync", () => {
  it("queries only the current workspace and returns the latest sync state", async () => {
    const latest = {
      state: "failed",
      last_error_code: "youtube_daily_quota_exceeded",
      created_at: "2026-08-03T20:00:00.000Z",
      lease_expires_at: null,
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [latest], error: null });
    const client = { from: vi.fn(() => query) };
    const source = new SupabaseDashboardDataSource(client as never);

    await expect(source.latestYoutubeSync("workspace-one")).resolves.toEqual({ data: latest, error: null });
    expect(client.from).toHaveBeenCalledWith("youtube_sync_runs");
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace-one");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when the workspace has no sync history", async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "eq", "order"]) query[method] = vi.fn(() => query);
    query.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const source = new SupabaseDashboardDataSource({ from: vi.fn(() => query) } as never);
    await expect(source.latestYoutubeSync("workspace-one")).resolves.toEqual({ data: null, error: null });
  });
  it("reads only the coarse worker heartbeat contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "healthy", lastSeenAt: "2026-08-03T20:00:00.000Z" }, error: null });
    const source = new SupabaseDashboardDataSource({ rpc } as never);
    await expect(source.youtubeWorkerStatus()).resolves.toEqual({ data: { status: "healthy", lastSeenAt: "2026-08-03T20:00:00.000Z" }, error: null });
    expect(rpc).toHaveBeenCalledWith("get_youtube_worker_status");
  });
  it("rejects worker payloads that could expose an instance identifier", async () => {
    const source = new SupabaseDashboardDataSource({ rpc: vi.fn().mockResolvedValue({ data: { status: "healthy", lastSeenAt: null, workerId: "host-name" }, error: null }) } as never);
    await expect(source.youtubeWorkerStatus()).resolves.toEqual({ data: null, error: "Worker status is temporarily unavailable." });
  });

});
