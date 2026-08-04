import { describe, expect, it } from "vitest";
import { boundedPreview, displayResearchState, parseResearchFilters, RESEARCH_PREVIEW_LIMIT, safeEvidenceUrl } from "./explorer";

describe("research explorer contracts", () => {
  it("bounds and validates untrusted filters", () => {
    expect(parseResearchFilters({ page: "-3", state: "invented", project: "not-a-uuid", from: "yesterday", to: "2026-08-03" })).toEqual({ page: 1, state: "all", projectId: null, from: null, to: "2026-08-03" });
    expect(parseResearchFilters({ page: "2", state: "completed", project: "00000000-0000-4000-8000-000000000001" })).toMatchObject({ page: 2, state: "completed", projectId: "00000000-0000-4000-8000-000000000001" });
  });
  it("maps operational states to truthful user states", () => {
    expect(displayResearchState("leased", null)).toBe("running");
    expect(displayResearchState("awaiting_approval", null)).toBe("awaiting_approval");
    expect(displayResearchState("cancelling", null)).toBe("cancelling");
    expect(displayResearchState("unexpected_guarded_state", null)).toBe("failed");
    expect(displayResearchState("failed", "lease_expired_at_max_attempts")).toBe("dead_letter");
    expect(displayResearchState("failed", "firecrawl_not_configured")).toBe("configuration_required");
  });
  it("normalizes and truncates evidence previews", () => {
    const preview = boundedPreview(`  ${"word ".repeat(100)}  `)!;
    expect(preview.length).toBeLessThanOrEqual(RESEARCH_PREVIEW_LIMIT + 1);
    expect(preview.endsWith("…")).toBe(true);
    expect(boundedPreview("   ")).toBeNull();
  });
  it("permits only web source links", () => {
    expect(safeEvidenceUrl("https://example.com/watch?v=1")).toBe("https://example.com/watch?v=1");
    expect(safeEvidenceUrl("javascript:alert(1)")).toBeNull();
    expect(safeEvidenceUrl("not a url")).toBeNull();
  });
});
