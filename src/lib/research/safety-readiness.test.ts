import { describe, expect, it } from "vitest";
import { researchSafetyReadiness } from "./safety-readiness";

describe("researchSafetyReadiness", () => {
  it("keeps paid research disabled in credential-free demo mode", () => {
    expect(researchSafetyReadiness({})).toEqual({
      mode: "demo",
      configurationComplete: false,
      providersActivated: false,
      activation: "disabled_in_demo",
      controls: { enforceable: false, verification: "not_applicable" },
      providers: {
        apify: "configuration_required",
        firecrawl: "configuration_required",
      },
      missing: ["worker", "apify", "firecrawl"],
    });
  });

  it("fails closed when connected mode has incomplete server configuration", () => {
    const readiness = researchSafetyReadiness({
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      APIFY_API_TOKEN: "configured",
    });

    expect(readiness.configurationComplete).toBe(false);
    expect(readiness.providersActivated).toBe(false);
    expect(readiness.activation).toBe("configuration_required");
    expect(readiness.controls).toEqual({ enforceable: true, verification: "hosted_required" });
    expect(readiness.providers.firecrawl).toBe("configuration_required");
    expect(readiness.missing).toEqual(["activation", "firecrawl"]);
  });

  it("keeps credentials present but paid providers disabled by default", () => {
    const readiness = researchSafetyReadiness({
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      APIFY_API_TOKEN: "configured",
      FIRECRAWL_API_KEY: "configured",
    });

    expect(readiness.configurationComplete).toBe(true);
    expect(readiness.providersActivated).toBe(false);
    expect(readiness.activation).toBe("disabled_by_operator");
    expect(readiness.providers).toEqual({ apify: "configured", firecrawl: "configured" });
    expect(readiness.missing).toEqual(["activation"]);
  });

  it("requires hosted verification even when all server configuration is present", () => {
    const readiness = researchSafetyReadiness({
      PAID_RESEARCH_PROVIDERS_ENABLED: "true",
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      APIFY_API_TOKEN: "configured",
      FIRECRAWL_API_KEY: "configured",
    });

    expect(readiness.configurationComplete).toBe(true);
    expect(readiness.providersActivated).toBe(true);
    expect(readiness.activation).toBe("hosted_verification_required");
    expect(readiness.controls).toEqual({ enforceable: true, verification: "hosted_required" });
    expect(readiness.providers).toEqual({ apify: "configured", firecrawl: "configured" });
    expect(readiness.missing).toEqual([]);
  });

  it("never includes secret values in the serialized readiness contract", () => {
    const readiness = researchSafetyReadiness({
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://secret-host.example",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "secret-publishable",
      SUPABASE_SERVICE_ROLE_KEY: "secret-service-role",
      APIFY_API_TOKEN: "secret-apify",
      FIRECRAWL_API_KEY: "secret-firecrawl",
    });
    const serialized = JSON.stringify(readiness);

    expect(serialized).not.toContain("secret-");
    expect(serialized).not.toContain("secret-host");
  });
});
