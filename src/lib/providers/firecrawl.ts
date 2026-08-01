import type { ResearchProvider, ResearchSource } from "./types";

export class FirecrawlProvider implements ResearchProvider {
  readonly name = "firecrawl" as const;
  constructor(private readonly apiKey?: string) {}
  isConfigured() { return Boolean(this.apiKey); }
  async research(query: string, limit: number): Promise<ResearchSource[]> {
    if (!this.apiKey) return [];
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Firecrawl request failed (${response.status}).`);
    const payload = await response.json() as { data?: { web?: Array<{ title?: string; url?: string; markdown?: string }> } };
    return (payload.data?.web ?? []).map((item) => ({
      provider: "firecrawl", type: "web", title: item.title ?? "Untitled source", url: item.url ?? "",
      text: item.markdown ?? "", capturedAt: new Date().toISOString(), provenance: { query },
    }));
  }
}
