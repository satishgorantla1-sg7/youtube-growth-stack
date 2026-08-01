import type { ResearchProvider, ResearchSource } from "./types";

export class ApifyYouTubeProvider implements ResearchProvider {
  readonly name = "apify" as const;
  constructor(private readonly token?: string, private readonly actorId = "streamers/youtube-scraper") {}
  isConfigured() { return Boolean(this.token); }
  async research(query: string, limit: number): Promise<ResearchSource[]> {
    if (!this.token) return [];
    const actor = encodeURIComponent(this.actorId);
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(this.token)}`;
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchKeywords: query, maxResults: limit }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Apify request failed (${response.status}).`);
    const items = await response.json() as Array<Record<string, unknown>>;
    return items.map((item) => ({
      provider: "apify", type: "youtube", title: String(item.title ?? "Untitled video"),
      url: String(item.url ?? item.videoUrl ?? ""), text: String(item.text ?? item.description ?? ""),
      capturedAt: new Date().toISOString(), provenance: { query, channel: String(item.channelName ?? "unknown") },
    }));
  }
}
