import { afterEach, describe, expect, it, vi } from "vitest";
import { ApifyYouTubeProvider } from "./apify";
import { FirecrawlProvider } from "./firecrawl";

afterEach(() => vi.unstubAllGlobals());

describe("research provider failure mapping", () => {
  it("classifies Firecrawl 503 as retryable without exposing credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    const provider = new FirecrawlProvider("secret-value");
    await expect(provider.research("query", 5)).rejects.toMatchObject({
      code: "firecrawl_http_503", retryable: true,
    });
  });

  it("classifies rate limits and network timeouts as retryable", async () => {
    const rateLimited = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", rateLimited);
    await expect(new FirecrawlProvider("secret-value").research("query", 5)).rejects.toMatchObject({
      code: "firecrawl_http_429", retryable: true,
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(new ApifyYouTubeProvider("secret-value").research("query", 5)).rejects.toMatchObject({
      code: "apify_unavailable", retryable: true,
    });
  });

  it("uses a bearer header and bounds Apify keyword requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await new ApifyYouTubeProvider("secret-value", "actor/id").research("query", 100);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("secret-value");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-value" });
    expect(JSON.parse(String(init.body))).toMatchObject({ searchQueries: ["query"], maxResults: 25 });
  });

  it("passes a YouTube URL to Apify as a direct start URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await new ApifyYouTubeProvider("secret-value").research(
      "Analyse https://www.youtube.com/channel/UC12345 for gaps",
      10,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      startUrls: [{ url: "https://www.youtube.com/channel/UC12345" }],
      maxResults: 10,
    });
  });

  it("uses Firecrawl v2 search source and markdown format contracts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { web: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await new FirecrawlProvider("secret-value").research("AI productivity", 5);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      sources: ["web"],
      scrapeOptions: { formats: [{ type: "markdown" }] },
    });
  });

  it("rejects malformed successful provider responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { web: "not-an-array" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(new FirecrawlProvider("secret-value").research("query", 5)).rejects.toMatchObject({
      code: "firecrawl_invalid_response", retryable: false,
    });
  });
});
