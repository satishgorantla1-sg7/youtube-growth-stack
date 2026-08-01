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

  it("uses a bearer header and bounds Apify result requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await new ApifyYouTubeProvider("secret-value", "actor/id").research("query", 100);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("secret-value");
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret-value" });
    expect(JSON.parse(String(init.body))).toMatchObject({ maxResults: 25 });
  });
});
