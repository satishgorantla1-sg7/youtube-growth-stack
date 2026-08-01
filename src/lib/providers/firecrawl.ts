import { ProviderError, type ResearchProvider, type ResearchSource } from "./types";

export class FirecrawlProvider implements ResearchProvider {
  readonly name = "firecrawl" as const;
  constructor(private readonly apiKey?: string) {}
  isConfigured() { return Boolean(this.apiKey); }
  async research(query: string, limit: number): Promise<ResearchSource[]> {
    if (!this.apiKey) return [];
    let response: Response;
    try {
      response = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: Math.min(limit, 25), scrapeOptions: { formats: ["markdown"] } }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ProviderError("firecrawl_unavailable", true);
    }
    if (!response.ok) throw new ProviderError(`firecrawl_http_${response.status}`, response.status === 429 || response.status >= 500);
    const payload = await response.json().catch(() => { throw new ProviderError("firecrawl_invalid_response", false); }) as { data?: { web?: Array<{ title?: string; url?: string; markdown?: string }> } };
    return (payload.data?.web ?? []).slice(0, Math.min(limit, 25)).map((item) => ({
      provider: "firecrawl" as const, type: "web" as const, title: item.title ?? "Untitled source", url: item.url ?? "",
      text: item.markdown ?? "", capturedAt: new Date().toISOString(), provenance: { query, adapter: "firecrawl-search-v2" },
    })).filter((source) => URL.canParse(source.url));
  }
}
