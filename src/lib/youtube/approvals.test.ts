import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import {
  authorizeYoutubeApprovalRequest,
  createYoutubeConnectionApproval,
  decideYoutubeConnectionApproval,
  YoutubeApprovalError,
} from "./approvals";

const workspaceId = "41000000-1000-4000-8000-000000000001";
const approvalId = "41000000-5000-4000-8000-000000000001";

function clientWith(rpcResult: { data: unknown; error: { message?: string; code?: string } | null }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-one" } }, error: null }) },
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
}

describe("YouTube connection approval service", () => {
  beforeEach(() => createClient.mockReset());

  it("fails closed when the caller is unauthenticated", async () => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    await expect(authorizeYoutubeApprovalRequest()).rejects.toEqual(
      expect.objectContaining({ code: "authentication_required" }),
    );
  });

  it("calls the create RPC and returns only the safe pending approval contract", async () => {
    const client = clientWith({
      data: {
        approvalId,
        workspaceId,
        state: "pending",
        riskSummary: "Authorize a read-only YouTube connection.",
        scope: "https://www.googleapis.com/auth/youtube.readonly",
        requestedAt: "2026-08-02T08:00:00+00:00",
        encryptedCredentials: "must-not-leak",
      },
      error: null,
    });

    const result = await createYoutubeConnectionApproval(client, workspaceId);

    expect(client.rpc).toHaveBeenCalledWith("create_youtube_connection_approval", {
      target_workspace_id: workspaceId,
    });
    expect(result).toEqual({
      approvalId,
      workspaceId,
      state: "pending",
      riskSummary: "Authorize a read-only YouTube connection.",
      scope: "https://www.googleapis.com/auth/youtube.readonly",
      requestedAt: "2026-08-02T08:00:00+00:00",
    });
  });

  it.each(["approved", "rejected"] as const)("passes a %s decision only through the audited RPC", async (decision) => {
    const client = clientWith({
      data: { approvalId, workspaceId, state: decision, decidedAt: "2026-08-02T08:05:00+00:00" },
      error: null,
    });

    const result = await decideYoutubeConnectionApproval(client, approvalId, {
      decision,
      note: "Explicit owner decision",
    });

    expect(client.rpc).toHaveBeenCalledWith("decide_youtube_connection_approval", {
      target_approval_id: approvalId,
      approval_decision: decision,
      approval_note: "Explicit owner decision",
    });
    expect(result.state).toBe(decision);
  });

  it("maps cross-workspace denial without exposing database details", async () => {
    const client = clientWith({
      data: null,
      error: { code: "42501", message: "youtube_approval_forbidden: internal row details" },
    });

    await expect(createYoutubeConnectionApproval(client, workspaceId)).rejects.toEqual(
      expect.objectContaining<Partial<YoutubeApprovalError>>({ code: "youtube_approval_forbidden" }),
    );
  });

  it("rejects malformed RPC output rather than leaking an unexpected payload", async () => {
    const client = clientWith({ data: { approvalId, token: "secret" }, error: null });

    await expect(createYoutubeConnectionApproval(client, workspaceId)).rejects.toEqual(
      expect.objectContaining({ code: "youtube_approval_unavailable" }),
    );
  });
});
