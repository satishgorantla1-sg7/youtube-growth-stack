import { afterEach, describe, expect, it, vi } from "vitest";
import { runResearch } from "./orchestrator";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("research orchestrator provider safety", () => {
  it("never calls paid providers in demo mode even when credentials exist", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "configured-firecrawl-key");
    vi.stubEnv("APIFY_API_TOKEN", "configured-apify-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sources = await runResearch("AI productivity", ["youtube", "web"], 10);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.provider === "demo")).toBe(true);
  });

  it("fails closed when connected mode is missing a requested provider", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("PAID_RESEARCH_PROVIDERS_ENABLED", "true");
    vi.stubEnv("FIRECRAWL_API_KEY", "configured-firecrawl-key");
    vi.stubEnv("APIFY_API_TOKEN", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runResearch("AI productivity", ["youtube", "web"], 10)).rejects.toMatchObject({
      code: "research_configuration_missing",
      retryable: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never calls paid providers when credentials exist but activation is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("FIRECRAWL_API_KEY", "configured-firecrawl-key");
    vi.stubEnv("APIFY_API_TOKEN", "configured-apify-key");
    vi.stubEnv("PAID_RESEARCH_PROVIDERS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runResearch("AI productivity", ["youtube", "web"], 10)).rejects.toMatchObject({
      code: "research_provider_disabled",
      retryable: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
