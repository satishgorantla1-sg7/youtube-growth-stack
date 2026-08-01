import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  authorize: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/youtube/approvals", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/youtube/approvals")>();
  return {
    ...original,
    authorizeYoutubeApprovalRequest: service.authorize,
    createYoutubeConnectionApproval: service.create,
  };
});

import { YoutubeApprovalError } from "@/lib/youtube/approvals";
import { POST } from "./route";

const workspaceId = "41000000-1000-4000-8000-000000000001";

function request(body: unknown, contentType = "application/json") {
  return new Request("http://localhost/api/integrations/youtube/approval", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });
}

describe("POST /api/integrations/youtube/approval", () => {
  beforeEach(() => {
    service.authorize.mockReset().mockResolvedValue({ rpc: vi.fn() });
    service.create.mockReset();
  });

  it("authenticates before parsing a workspace-bearing request", async () => {
    service.authorize.mockRejectedValue(new YoutubeApprovalError("authentication_required"));

    const response = await POST(request({ workspaceId }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ workspaceId: "not-a-uuid" }],
    [{ workspaceId, unexpected: true }],
    [{}],
  ])("rejects invalid or non-strict input", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_youtube_approval_request" });
  });

  it("returns only a persisted pending approval", async () => {
    const approval = {
      approvalId: "41000000-5000-4000-8000-000000000001",
      workspaceId,
      state: "pending",
      riskSummary: "Authorize a read-only YouTube connection.",
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      requestedAt: "2026-08-02T08:00:00+00:00",
    };
    service.create.mockResolvedValue(approval);

    const response = await POST(request({ workspaceId }));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(approval);
    expect(service.create).toHaveBeenCalledWith(expect.anything(), workspaceId);
  });

  it("maps a cross-workspace RPC denial to a safe forbidden response", async () => {
    service.create.mockRejectedValue(new YoutubeApprovalError("youtube_approval_forbidden"));
    const response = await POST(request({ workspaceId }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "youtube_approval_forbidden" });
  });
});
