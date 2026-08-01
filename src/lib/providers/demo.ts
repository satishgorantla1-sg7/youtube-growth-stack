import type { ResearchProvider, ResearchSource } from "./types";

export class DemoResearchProvider implements ResearchProvider {
  readonly name = "demo" as const;
  isConfigured() { return true; }
  async research(query: string): Promise<ResearchSource[]> {
    return (["youtube", "web"] as const).map((type) => ({
      provider: "demo" as const, type,
      title: `Demo ${type} evidence for: ${query}`,
      url: type === "youtube" ? "https://www.youtube.com/" : "https://example.com/research",
      text: "Deterministic demo evidence exercises the durable approval loop without paid credentials.",
      capturedAt: new Date().toISOString(),
      provenance: { demo: true, query, sourceType: type },
    }));
  }
}
