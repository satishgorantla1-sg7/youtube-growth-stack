import { describe, expect, it } from "vitest";
import { parseResearchWorkerPollMs } from "./worker-config";

describe("parseResearchWorkerPollMs", () => {
  it("falls back for non-finite values instead of creating a busy loop", () => {
    expect(parseResearchWorkerPollMs("not-a-number")).toBe(2_000);
    expect(parseResearchWorkerPollMs("Infinity")).toBe(2_000);
  });

  it("clamps finite values to safe polling bounds", () => {
    expect(parseResearchWorkerPollMs("0")).toBe(250);
    expect(parseResearchWorkerPollMs("1000")).toBe(1_000);
    expect(parseResearchWorkerPollMs("999999")).toBe(30_000);
  });
});
