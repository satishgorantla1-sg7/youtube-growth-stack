import { describe, expect, it } from "vitest";
import { approvalDecisionSchema, researchRequestSchema } from "./schemas";

describe("researchRequestSchema", () => {
  it("applies safe defaults", () => {
    const result = researchRequestSchema.parse({ prompt: "Find a content gap", idempotencyKey: "request-123" });
    expect(result).toMatchObject({ mode: "quick", sources: ["youtube", "web"] });
  });

  it("rejects empty and oversized prompts", () => {
    expect(researchRequestSchema.safeParse({ prompt: " " }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ prompt: "x".repeat(2_001) }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ prompt: "Valid prompt", idempotencyKey: "short" }).success).toBe(false);
  });
});

describe("approvalDecisionSchema", () => {
  it("accepts an explicit decision", () => {
    expect(approvalDecisionSchema.parse({ approvalId: "10000000-0000-4000-8000-000000000001", decision: "approved" }).decision).toBe("approved");
  });

  it("rejects an invented state", () => {
    expect(approvalDecisionSchema.safeParse({ approvalId: "10000000-0000-4000-8000-000000000001", decision: "maybe" }).success).toBe(false);
  });
});
