import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const keys = [
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APIFY_API_TOKEN",
  "FIRECRAWL_API_KEY",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/health", () => {
  it("returns liveness separately from fail-closed paid-research readiness", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.APIFY_API_TOKEN;
    delete process.env.FIRECRAWL_API_KEY;

    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.research).toMatchObject({
      mode: "connected",
      configurationComplete: false,
      activation: "configuration_required",
      controls: { enforceable: false, verification: "configuration_required" },
      providers: {
        apify: "configuration_required",
        firecrawl: "configuration_required",
      },
    });
  });
});
