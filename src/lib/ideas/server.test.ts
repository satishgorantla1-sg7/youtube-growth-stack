import { describe, expect, it } from "vitest";
import { ideaGenerationInputSchema } from "./server";

const valid = { researchRunId: "11111111-1111-4111-8111-111111111111", evidenceSourceIds: ["22222222-2222-4222-8222-222222222222"], maxIdeas: 3, idempotencyKey: "request-123" };

describe("ideaGenerationInputSchema", () => {
  it("accepts a bounded explicit generation request", () => {
    expect(ideaGenerationInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects duplicated evidence and unbounded output", () => {
    expect(ideaGenerationInputSchema.safeParse({ ...valid, evidenceSourceIds: [valid.evidenceSourceIds[0], valid.evidenceSourceIds[0]] }).success).toBe(false);
    expect(ideaGenerationInputSchema.safeParse({ ...valid, maxIdeas: 10 }).success).toBe(false);
  });
});
