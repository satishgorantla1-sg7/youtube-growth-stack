import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createOrGet: vi.fn() }));
vi.mock("@/lib/research/repository", () => ({ researchJobRepository: () => ({ createOrGet: mocks.createOrGet }) }));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.createOrGet.mockReset();
});

describe("POST /api/research activation gate", () => {
  it("creates no run or approval when connected credentials exist but activation is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("PAID_RESEARCH_PROVIDERS_ENABLED", "false");
    vi.stubEnv("APIFY_API_TOKEN", "configured");
    vi.stubEnv("FIRECRAWL_API_KEY", "configured");
    const request = new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Research AI productivity", mode: "quick", sources: ["youtube", "web"], idempotencyKey: "disabled-request" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "research_provider_disabled" });
    expect(mocks.createOrGet).not.toHaveBeenCalled();
  });
});
