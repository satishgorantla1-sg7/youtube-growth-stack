import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));

describe("POST /api/research/[runId]/cancel", () => {
  beforeEach(() => { mocks.getUser.mockReset(); mocks.rpc.mockReset(); });
  it("rejects invalid input before database access", async () => {
    const response = await POST(new Request("http://test/cancel", { method: "POST", body: JSON.stringify({ note: "x".repeat(501) }) }), { params: Promise.resolve({ runId: "bad" }) });
    expect(response.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("returns the audited database cancellation result", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { runId: "550e8400-e29b-41d4-a716-446655440000", state: "cancelled" }, error: null });
    const response = await POST(new Request("http://test/cancel", { method: "POST", body: JSON.stringify({ note: "Stop" }) }), { params: Promise.resolve({ runId: "550e8400-e29b-41d4-a716-446655440000" }) });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_research_run", expect.objectContaining({ cancellation_note: "Stop" }));
  });
  it("does not expose unexpected database errors", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "internal relation detail" } });
    const response = await POST(new Request("http://test/cancel", { method: "POST", body: "{}" }), { params: Promise.resolve({ runId: "550e8400-e29b-41d4-a716-446655440000" }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "research_cancellation_unavailable" });
  });
});
