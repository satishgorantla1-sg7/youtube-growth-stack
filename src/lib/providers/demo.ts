import type { ResearchProvider, ResearchSource } from "./types";

export class DemoResearchProvider implements ResearchProvider {
  readonly name = "demo" as const;
  isConfigured() { return true; }
  async research(query: string): Promise<ResearchSource[]> {
    return [{
      provider: "demo",
      type: "youtube",
      title: `Demo evidence for: ${query}`,
      url: "https://www.youtube.com/",
      text: "Deterministic demo evidence lets contributors run the approval loop without paid credentials.",
      capturedAt: new Date().toISOString(),
      provenance: { demo: true },
    }];
  }
}
