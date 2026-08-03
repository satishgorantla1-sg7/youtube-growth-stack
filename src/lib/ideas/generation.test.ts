import { describe, expect, it, vi } from "vitest";
import { DemoIdeaGenerationProvider } from "./demo-provider";
import { generateEvidenceGroundedIdeas, type IdeaGenerationProvider, type IdeaGenerationRepository } from "./generation";

const sourceId = "51000000-4000-4000-8000-000000000001";
const input = {
  generationRunId: "51000000-5000-4000-8000-000000000001",
  workspaceId: "51000000-1000-4000-8000-000000000001",
  researchRunId: "51000000-3000-4000-8000-000000000001",
  maxIdeas: 3,
  evidence: [{ id: sourceId, title: "Useful source", content: "Evidence", url: "https://example.com/source" }],
};
const valid = [{
  title: "A grounded idea", premise: "A sufficiently detailed evidence-grounded premise.",
  demandScore: 75, demandReason: "Observed audience need.", relevanceScore: 80, relevanceReason: "Matches the research question.",
  competitionScore: 40, competitionReason: "Moderate competing coverage.", confidenceScore: 85,
  confidenceReason: "Direct source support.", evidenceSourceIds: [sourceId],
}];
const repo = (): IdeaGenerationRepository => ({ persist: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined) });

describe("evidence-grounded idea generation", () => {
  it("validates then atomically hands one complete batch to persistence", async () => {
    const repository = repo();
    await expect(generateEvidenceGroundedIdeas({ generate: vi.fn().mockResolvedValue(valid) }, repository, input)).resolves.toEqual(valid);
    expect(repository.persist).toHaveBeenCalledOnce();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("fails closed on invented citations without persisting a partial batch", async () => {
    const repository = repo();
    const output = [{ ...valid[0], evidenceSourceIds: ["52000000-4000-4000-8000-000000000002"] }];
    await expect(generateEvidenceGroundedIdeas({ generate: vi.fn().mockResolvedValue(output) }, repository, input))
      .rejects.toMatchObject({ code: "invalid_evidence" });
    expect(repository.persist).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(input.generationRunId, "invalid_evidence");
  });

  it("rejects duplicate citations and oversized or malformed model output", async () => {
    const repository = repo();
    const output = [{ ...valid[0], evidenceSourceIds: [sourceId, sourceId] }];
    await expect(generateEvidenceGroundedIdeas({ generate: vi.fn().mockResolvedValue(output) }, repository, input))
      .rejects.toMatchObject({ code: "invalid_evidence" });
    await expect(generateEvidenceGroundedIdeas({ generate: vi.fn().mockResolvedValue([]) }, repository, input))
      .rejects.toMatchObject({ code: "invalid_ai_output" });
    expect(repository.persist).not.toHaveBeenCalled();
  });

  it("bounds provider execution with an abort signal", async () => {
    const repository = repo();
    const provider: IdeaGenerationProvider = { generate: (_input, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) };
    await expect(generateEvidenceGroundedIdeas(provider, repository, input, 100)).rejects.toMatchObject({ code: "generation_timeout" });
    expect(repository.fail).toHaveBeenCalledWith(input.generationRunId, "generation_timeout");
  });

  it("keeps demo output deterministic, bounded, evidence-linked, and free of vendor calls", async () => {
    const provider = new DemoIdeaGenerationProvider();
    const first = await provider.generate(input, new AbortController().signal);
    const second = await provider.generate(input, new AbortController().signal);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0].evidenceSourceIds).toEqual([sourceId]);
  });
});
