import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })),
}));

describe("POST /api/research/[runId]/retry", () => {
  beforeEach(() => { mocks.getUser.mockReset(); mocks.rpc.mockReset(); });
  it("requires an authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request("http://test/retry", { method: "POST", body: JSON.stringify({ idempotencyKey: "retry-key-one" }) }), { params: Promise.resolve({ runId: "550e8400-e29b-41d4-a716-446655440000" }) });
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns 201 only for a newly approval-gated retry", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { runId: "new", approvalId: "approval", state: "awaiting_approval", created: true }, error: null });
    const response = await POST(new Request("http://test/retry", { method: "POST", body: JSON.stringify({ idempotencyKey: "retry-key-one" }) }), { params: Promise.resolve({ runId: "550e8400-e29b-41d4-a716-446655440000" }) });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ state: "awaiting_approval", created: true });
  });
});
