import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { describe, expect, it, vi } from "vitest";
import { ensureWorkspace } from "./workspace";

function clientWith(membership: { data: unknown; error: { message: string } | null }, rpc = vi.fn()) {
  const maybeSingle = vi.fn().mockResolvedValue(membership);
  const limit = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ limit }));
  return {
    client: { from: vi.fn(() => ({ select })), rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

describe("ensureWorkspace", () => {
  it("returns an existing membership without creating another workspace", async () => {
    const { client, rpc } = clientWith({ data: { workspace_id: "workspace-1" }, error: null });
    await expect(ensureWorkspace(client, { workspaceName: "Ignored", workspaceSlug: "ignored" }))
      .resolves.toEqual({ error: null, workspaceId: "workspace-1" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports incomplete onboarding when no creation input exists", async () => {
    const { client } = clientWith({ data: null, error: null });
    await expect(ensureWorkspace(client)).resolves.toEqual({
      error: "Workspace setup is incomplete.",
      workspaceId: null,
    });
  });

  it("surfaces membership and RPC failures without inventing a workspace", async () => {
    const membershipFailure = clientWith({ data: null, error: { message: "membership unavailable" } });
    await expect(ensureWorkspace(membershipFailure.client)).resolves.toEqual({
      error: "membership unavailable",
      workspaceId: null,
    });

    const rpcFailure = vi.fn().mockResolvedValue({ data: null, error: { message: "slug conflict" } });
    const creationFailure = clientWith({ data: null, error: null }, rpcFailure);
    await expect(ensureWorkspace(creationFailure.client, { workspaceName: "Creator", workspaceSlug: "creator" }))
      .resolves.toEqual({ error: "slug conflict", workspaceId: null });
  });
});
