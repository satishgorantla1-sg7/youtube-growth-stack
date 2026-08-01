import { describe, expect, it } from "vitest";
import { DemoResearchProvider } from "./demo";

describe("DemoResearchProvider", () => {
  it("returns deterministic, traceable evidence", async () => {
    const provider = new DemoResearchProvider();
    const [source] = await provider.research("AI workflows");
    expect(provider.isConfigured()).toBe(true);
    expect(source.provider).toBe("demo");
    expect(source.provenance.demo).toBe(true);
    expect(source.title).toContain("AI workflows");
  });
});
