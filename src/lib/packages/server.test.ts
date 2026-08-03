import { describe, expect, it, vi } from "vitest";
import { createNextPackageVersion, decidePackageApproval, generatePackageForUser, packageDecisionInputSchema, packageGenerationInputSchema, requestPackageApproval } from "./server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const workspaceId = "71000000-1000-4000-8000-000000000001";
const userId = "71000000-0000-4000-8000-000000000001";
const ideaId = "71000000-5000-4000-8000-000000000001";
const sourceId = "71000000-4000-4000-8000-000000000001";

function authenticated(status = "approved", withEvidence = true) {
  return {
    from: vi.fn((table: string) => {
      if (table === "ideas") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: ideaId, title: "Evidence-led growth", premise: "Use verified research to build a practical video.", status }, error: null }) }) }) }) };
      if (table === "idea_evidence") return { select: () => ({ eq: () => ({ eq: async () => ({ data: withEvidence ? [{ research_source_id: sourceId }] : [], error: null }) }) }) };
      return { select: () => ({ eq: () => ({ in: async () => ({ data: [{ id: sourceId, title: "Verified source", content: "A bounded finding", url: "https://example.com/source" }], error: null }) }) }) };
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("package server workflow", () => {
  it("generates and persists a package only for an approved idea with tenant evidence", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { packageId: "71000000-6000-4000-8000-000000000001", workspaceId, ideaId, version: 1, state: "draft", created: true }, error: null });
    const result = await generatePackageForUser(authenticated(), { workspaceId, userId, ideaId, idempotencyKey: "package-request" }, () => ({ rpc }) as unknown as SupabaseClient<Database>);
    expect(result.content.citations).toEqual([sourceId]);
    expect(rpc).toHaveBeenCalledWith("create_content_package_version", expect.objectContaining({ target_workspace_id: workspaceId, target_idea_id: ideaId, target_requested_by: userId }));
  });

  it("stops before generation for an unapproved idea or missing evidence", async () => {
    await expect(generatePackageForUser(authenticated("draft"), { workspaceId, userId, ideaId, idempotencyKey: "package-request" })).rejects.toMatchObject({ code: "approved_idea_required" });
    await expect(generatePackageForUser(authenticated("approved", false), { workspaceId, userId, ideaId, idempotencyKey: "package-request" })).rejects.toMatchObject({ code: "invalid_package_evidence" });
  });

  it("uses authenticated RPCs for approval, decision, and immutable next-version actions", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { state: "ok" }, error: null });
    const client = { rpc } as unknown as SupabaseClient<Database>;
    await requestPackageApproval(client, "71000000-6000-4000-8000-000000000001");
    await decidePackageApproval(client, "71000000-7000-4000-8000-000000000001", "rejected", "Needs revision");
    await createNextPackageVersion(client, "71000000-6000-4000-8000-000000000001", "next-version-key");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["request_content_package_approval", "decide_content_package_approval", "create_next_content_package_version"]);
  });

  it("validates bounded strict browser requests", () => {
    expect(packageGenerationInputSchema.safeParse({ ideaId, idempotencyKey: "valid-key" }).success).toBe(true);
    expect(packageGenerationInputSchema.safeParse({ ideaId, idempotencyKey: "short" }).success).toBe(false);
    expect(packageDecisionInputSchema.safeParse({ approvalId: userId, decision: "published" }).success).toBe(false);
    expect(packageDecisionInputSchema.safeParse({ approvalId: userId, decision: "approved", note: "x".repeat(501) }).success).toBe(false);
  });
});
