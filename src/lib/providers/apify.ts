import { z } from "zod";
import { ProviderError, type ResearchProvider, type ResearchSource } from "./types";

const apifyItemSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  videoUrl: z.string().optional(),
  text: z.string().optional(),
  description: z.string().optional(),
  channelName: z.string().optional(),
}).passthrough();

const apifyResponseSchema = z.array(apifyItemSchema);

function youtubeUrlsFrom(query: string) {
  const candidates = query.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return candidates.flatMap((candidate) => {
    const cleaned = candidate.replace(/[),.;!?]+$/, "");
    try {
      const url = new URL(cleaned);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" ? [url.toString()] : [];
    } catch {
      return [];
    }
  });
}

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
      const boundedLimit = Math.min(Math.max(limit, 1), 25);
      const directUrls = youtubeUrlsFrom(query);
      const input = directUrls.length
        ? { startUrls: directUrls.map((directUrl) => ({ url: directUrl })), maxResults: boundedLimit, maxResultsShorts: 0, maxResultStreams: 0 }
        : { searchQueries: [query], maxResults: boundedLimit, maxResultsShorts: 0, maxResultStreams: 0 };
      response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ProviderError("apify_unavailable", true);
    }
    if (!response.ok) throw new ProviderError(`apify_http_${response.status}`, response.status === 429 || response.status >= 500);
    const payload = await response.json().catch(() => { throw new ProviderError("apify_invalid_response", false); });
    const parsed = apifyResponseSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderError("apify_invalid_response", false);
    return parsed.data.slice(0, Math.min(limit, 25)).map((item) => ({
      provider: "apify" as const,
      type: "youtube" as const,
      title: item.title ?? "Untitled video",
      url: item.url ?? item.videoUrl ?? "",
      text: item.text ?? item.description ?? "",
      capturedAt: new Date().toISOString(),
      provenance: { query, channel: item.channelName ?? "unknown", adapter: "apify-youtube-v2" },
    })).filter((source) => URL.canParse(source.url));
  }
}
