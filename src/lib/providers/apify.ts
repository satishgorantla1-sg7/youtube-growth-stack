import { ProviderError, type ResearchProvider, type ResearchSource } from "./types";

export class ApifyYouTubeProvider implements ResearchProvider {
  readonly name = "apify" as const;
  constructor(private readonly token?: string, private readonly actorId = "streamers/youtube-scraper") {}
  isConfigured() { return Boolean(this.token); }
  async research(query: string, limit: number): Promise<ResearchSource[]> {
    if (!this.token) return [];
    const actor = encodeURIComponent(this.actorId);
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ searchKeywords: query, maxResults: Math.min(limit, 25) }), signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ProviderError("apify_unavailable", true);
    }
    if (!response.ok) throw new ProviderError(`apify_http_${response.status}`, response.status === 429 || response.status >= 500);
    const items = await response.json().catch(() => { throw new ProviderError("apify_invalid_response", false); }) as Array<Record<string, unknown>>;
    return items.slice(0, Math.min(limit, 25)).map((item) => ({
      provider: "apify" as const, type: "youtube" as const, title: String(item.title ?? "Untitled video"),
      url: String(item.url ?? item.videoUrl ?? ""), text: String(item.text ?? item.description ?? ""),
      capturedAt: new Date().toISOString(), provenance: { query, channel: String(item.channelName ?? "unknown"), adapter: "apify-youtube-v1" },
    })).filter((source) => URL.canParse(source.url));
  }
}
