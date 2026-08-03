import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const approvalId = "00000000-0000-4000-8000-000000000003";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/youtube/lifecycle-controls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/youtube/lifecycle-controls")>();
  return { ...actual, authorizeYoutubeLifecycleRequest: mocks.authorize, createYoutubeRevocationApproval: mocks.create };
});

function request() { return new Request("http://test/api/integrations/youtube/revocation-approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }) }); }

describe("POST /api/integrations/youtube/revocation-approval", () => {
  beforeEach(() => { mocks.authorize.mockReset().mockResolvedValue({}); mocks.create.mockReset(); });

  it("returns 201 for a newly pending revocation approval", async () => {
    mocks.create.mockResolvedValue({ approvalId, workspaceId, state: "pending", purpose: "revoke", riskSummary: "Revoke", requestedAt: "2026-08-03T10:00:00.000Z", reused: false });
    const response = await POST(request());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ approvalId, state: "pending", reused: false });
  });

  it("returns 200 when the same expired approved revocation is safely reused", async () => {
    mocks.create.mockResolvedValue({ approvalId, workspaceId, state: "approved", purpose: "revoke", riskSummary: "Revoke", requestedAt: "2026-08-03T10:00:00.000Z", decidedAt: "2026-08-03T10:01:00.000Z", decidedBy: "00000000-0000-4000-8000-000000000007", reused: true });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ approvalId, state: "approved", reused: true });
  });
});
