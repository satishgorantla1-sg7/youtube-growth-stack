import { describe, expect, it, vi } from "vitest";
import { beginIdeaGeneration, SupabaseIdeaGenerationRepository } from "./repository";
const generationId = "61000000-5000-4000-8000-000000000001";
const workspaceId = "61000000-1000-4000-8000-000000000001";
const researchRunId = "61000000-3000-4000-8000-000000000001";
describe("idea generation RPC repository", () => {
  it("uses the service-owned idempotent begin contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: generationId, workspaceId, researchRunId, state: "generating", created: true }, error: null });
    await expect(beginIdeaGeneration({ rpc }, { workspaceId, researchRunId, requestedBy: "61000000-0000-4000-8000-000000000001", idempotencyKey: "idea-request-one", maxIdeas: 3, modelVersion: "demo-v1", promptVersion: "ideas-v1" })).resolves.toMatchObject({ id: generationId, created: true });
    expect(rpc).toHaveBeenCalledWith("begin_idea_generation", expect.objectContaining({ target_workspace_id: workspaceId, request_max_ideas: 3 }));
  });
  it("sends one complete batch to atomic persistence", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { state: "completed" }, error: null });
    await new SupabaseIdeaGenerationRepository({ rpc }).persist(generationId, []);
    expect(rpc).toHaveBeenCalledWith("persist_generated_ideas", { target_generation_run_id: generationId, generated_ideas: [] });
  });
  it("maps database details to stable non-sensitive errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "completed_research_required internal row" } });
    await expect(beginIdeaGeneration({ rpc }, { workspaceId, researchRunId, requestedBy: "61000000-0000-4000-8000-000000000001", idempotencyKey: "idea-request-one", maxIdeas: 3, modelVersion: "demo-v1", promptVersion: "ideas-v1" }))
      .rejects.toMatchObject({ code: "completed_research_required" });
  });
});
