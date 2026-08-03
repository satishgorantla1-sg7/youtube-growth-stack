import { describe, expect, it, vi } from "vitest";
import { disconnectYoutube } from "./youtube-disconnect-server";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const approvalId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";

describe("disconnectYoutube", () => {
  it("revalidates approval then revokes server-side without returning credentials", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { approvalId, workspaceId, state: "approved", purpose: "revoke", decidedAt: "2026-08-02T01:01:00.000Z", decidedBy: userId }, error: null });
    const revoke = vi.fn().mockResolvedValue({ status: "revoked" });
    const result = await disconnectYoutube({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) }, rpc }, { workspaceId, approvalId }, () => ({ revoke } as never));
    expect(revoke).toHaveBeenCalledWith(workspaceId, approvalId);
    expect(result).toEqual({ status: "revoked" });
    expect(JSON.stringify(result)).not.toMatch(/token|credential|secret/i);
  });

  it("rejects an approval from another workspace before revocation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { approvalId, workspaceId: "00000000-0000-4000-8000-000000000099", state: "approved", purpose: "revoke", decidedAt: "2026-08-02T01:01:00.000Z", decidedBy: userId }, error: null });
    const revoke = vi.fn();
    await expect(disconnectYoutube({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) }, rpc }, { workspaceId, approvalId }, () => ({ revoke } as never)))
      .rejects.toMatchObject({ code: "youtube_lifecycle_forbidden" });
    expect(revoke).not.toHaveBeenCalled();
  });

  it("rejects a connect approval before constructing the service-role lifecycle", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { approvalId, workspaceId, state: "approved", purpose: "connect", decidedAt: "2026-08-02T01:01:00.000Z", decidedBy: userId }, error: null });
    const revoke = vi.fn();
    const createLifecycle = vi.fn(() => ({ revoke } as never));

    await expect(disconnectYoutube({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) }, rpc }, { workspaceId, approvalId }, createLifecycle))
      .rejects.toMatchObject({ code: "approval_required" });
    expect(createLifecycle).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("rejects an approval from another user before constructing the service-role lifecycle", async () => {
    const otherUserId = "00000000-0000-4000-8000-000000000009";
    const rpc = vi.fn().mockResolvedValue({ data: { approvalId, workspaceId, state: "approved", purpose: "revoke", decidedAt: "2026-08-02T01:01:00.000Z", decidedBy: otherUserId }, error: null });
    const createLifecycle = vi.fn();
    await expect(disconnectYoutube(
      { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) }, rpc },
      { workspaceId, approvalId },
      createLifecycle,
    )).rejects.toMatchObject({ code: "youtube_lifecycle_forbidden" });
    expect(createLifecycle).not.toHaveBeenCalled();
  });
});
