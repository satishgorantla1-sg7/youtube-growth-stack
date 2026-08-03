import { describe, expect, it, vi } from "vitest";
import {
  authorizeApprovedRevocation,
  createYoutubeRevocationApproval,
  requestYoutubeSync,
  requestYoutubeSyncSchema,
  selectYoutubeChannel,
  selectYoutubeChannelSchema,
} from "./lifecycle-controls";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const channelId = "00000000-0000-4000-8000-000000000002";
const approvalId = "00000000-0000-4000-8000-000000000003";
const connectionId = "00000000-0000-4000-8000-000000000004";
const runId = "00000000-0000-4000-8000-000000000005";
const correlationId = "00000000-0000-4000-8000-000000000006";
const userId = "00000000-0000-4000-8000-000000000007";

function client(data: unknown) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("YouTube lifecycle controls", () => {
  it("strictly validates tenant selection and bounded sync inputs", () => {
    expect(selectYoutubeChannelSchema.safeParse({ workspaceId, channelId, extra: true }).success).toBe(false);
    expect(requestYoutubeSyncSchema.safeParse({ workspaceId, channelId, idempotencyKey: "short" }).success).toBe(false);
    expect(requestYoutubeSyncSchema.safeParse({ workspaceId, channelId, idempotencyKey: "request-123", maxPages: 11 }).success).toBe(false);
  });

  it("selects a channel through the authenticated tenant RPC", async () => {
    const rpcClient = client({ workspaceId, channelId, externalId: "UC123", selected: true });
    await expect(selectYoutubeChannel(rpcClient, { workspaceId, channelId })).resolves.toMatchObject({ channelId, selected: true });
    expect(rpcClient.rpc).toHaveBeenCalledWith("select_youtube_channel", {
      target_workspace_id: workspaceId, target_channel_id: channelId,
    });
  });

  it("requests an idempotent bounded sync through the authenticated tenant RPC", async () => {
    const rpcClient = client({ id: runId, workspaceId, connectionId, channelId, state: "queued", maxPages: 5, maxItems: 250, correlationId, created: true });
    await expect(requestYoutubeSync(rpcClient, { workspaceId, channelId, idempotencyKey: "sync-request-123", maxPages: 5, maxItems: 250 })).resolves.toMatchObject({ id: runId, created: true });
    expect(rpcClient.rpc).toHaveBeenCalledWith("request_youtube_sync", {
      target_workspace_id: workspaceId, target_channel_id: channelId,
      target_idempotency_key: "sync-request-123", target_max_pages: 5, target_max_items: 250,
    });
  });

  it("uses the purpose-specific revocation approval contract", async () => {
    const rpcClient = client({ approvalId, workspaceId, state: "pending", riskSummary: "Revoke Google access only.", requestedAt: "2026-08-02T01:00:00.000Z" });
    await expect(createYoutubeRevocationApproval(rpcClient, workspaceId)).resolves.toMatchObject({ approvalId, state: "pending" });
    expect(rpcClient.rpc).toHaveBeenCalledWith("create_youtube_revocation_approval", { target_workspace_id: workspaceId });
  });

  it("revalidates current owner/admin authorization before service revocation", async () => {
    const rpcClient = client({ approvalId, workspaceId, state: "approved", purpose: "revoke", decidedAt: "2026-08-02T01:01:00.000Z", decidedBy: userId });
    await expect(authorizeApprovedRevocation(rpcClient, approvalId)).resolves.toMatchObject({ approvalId, workspaceId });
    expect(rpcClient.rpc).toHaveBeenCalledWith("decide_youtube_connection_approval", {
      target_approval_id: approvalId, approval_decision: "approved", approval_note: null,
    });
  });
});

  it("rejects an approval decided by another user", async () => {
    const otherUserId = "00000000-0000-4000-8000-000000000008";
    const rpcClient = client({ approvalId, workspaceId, state: "approved", purpose: "revoke", decidedAt: "2026-08-02T01:01:00.000Z", decidedBy: otherUserId });
    await expect(authorizeApprovedRevocation(rpcClient, approvalId)).rejects.toMatchObject({ code: "youtube_lifecycle_forbidden" });
  });
