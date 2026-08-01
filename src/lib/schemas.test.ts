import { describe, expect, it } from "vitest";
import { approvalDecisionSchema, researchRequestSchema } from "./schemas";

describe("researchRequestSchema", () => {
  it("applies safe defaults", () => {
    const result = researchRequestSchema.parse({ prompt: "Find a content gap" });
    expect(result).toMatchObject({ mode: "quick", sources: ["youtube", "web"] });
  });

  it("rejects empty and oversized prompts", () => {
    expect(researchRequestSchema.safeParse({ prompt: " " }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ prompt: "x".repeat(2_001) }).success).toBe(false);
  });
});

describe("approvalDecisionSchema", () => {
  it("accepts an explicit decision", () => {
    expect(approvalDecisionSchema.parse({ approvalId: "approval-1", decision: "approved" }).decision).toBe("approved");
  });

  it("rejects an invented state", () => {
    expect(approvalDecisionSchema.safeParse({ approvalId: "approval-1", decision: "maybe" }).success).toBe(false);
  });
});
