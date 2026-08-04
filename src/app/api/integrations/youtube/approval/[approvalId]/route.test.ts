import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  authorize: vi.fn(),
  decide: vi.fn(),
}));
vi.mock("@/lib/youtube/approvals", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/youtube/approvals")>();
  return {
    ...original,
    authorizeYoutubeApprovalRequest: service.authorize,
    decideYoutubeConnectionApproval: service.decide,
  };
});

import { YoutubeApprovalError } from "@/lib/youtube/approvals";
import { POST } from "./route";

const approvalId = "41000000-5000-4000-8000-000000000001";

function request(body: unknown) {
  return new Request(`http://localhost/api/integrations/youtube/approval/${approvalId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(id = approvalId) {
  return { params: Promise.resolve({ approvalId: id }) };
}

describe("POST /api/integrations/youtube/approval/[approvalId]", () => {
  beforeEach(() => {
    service.authorize.mockReset().mockResolvedValue({ rpc: vi.fn() });
    service.decide.mockReset();
  });

  it.each([
    [{ decision: "maybe" }],
    [{ decision: "approved", note: "" }],
    [{ decision: "approved", note: "x".repeat(501) }],
    [{ decision: "approved", extra: true }],
  ])("rejects invalid decision input", async (body) => {
    const response = await POST(request(body), context());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_youtube_approval_decision" });
  });

  it("rejects an invalid approval identifier", async () => {
    const response = await POST(request({ decision: "approved" }), context("not-a-uuid"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_youtube_approval_id" });
  });

  it.each(["approved", "rejected"] as const)("returns a safe %s result", async (decision) => {
    const result = {
      approvalId,
      workspaceId: "41000000-1000-4000-8000-000000000001",
      state: decision,
      decidedAt: "2026-08-02T08:05:00+00:00",
    };
    service.decide.mockResolvedValue(result);

    const response = await POST(request({ decision, note: "Explicit owner decision" }), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(service.decide).toHaveBeenCalledWith(expect.anything(), approvalId, {
      decision,
      note: "Explicit owner decision",
    });
  });

  it("maps a stale approval transition to conflict", async () => {
    service.decide.mockRejectedValue(new YoutubeApprovalError("approval_not_pending"));
    const response = await POST(request({ decision: "approved" }), context());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "approval_not_pending" });
  });
});
