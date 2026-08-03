import { afterEach, describe, expect, it, vi } from "vitest";
import { researchDispatchStatus } from "./dispatcher";

afterEach(() => vi.unstubAllEnvs());

function configuredEnvironment(enabled: "true" | "false") {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  vi.stubEnv("APIFY_API_TOKEN", "configured");
  vi.stubEnv("FIRECRAWL_API_KEY", "configured");
  vi.stubEnv("PAID_RESEARCH_PROVIDERS_ENABLED", enabled);
}

describe("research dispatch activation", () => {
  it("does not start a worker when credentials exist but the operator gate is closed", () => {
    configuredEnvironment("false");
    expect(researchDispatchStatus()).toEqual({ state: "configuration_required", missing: ["activation"] });
  });

  it("becomes dispatchable only after explicit server activation", () => {
    configuredEnvironment("true");
    expect(researchDispatchStatus()).toEqual({ state: "idle", missing: [] });
  });
});
