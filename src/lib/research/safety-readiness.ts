export type ResearchProviderConfiguration = {
  apify: "configured" | "configuration_required";
  firecrawl: "configured" | "configuration_required";
};

export type ResearchSafetyReadiness = {
  mode: "demo" | "connected";
  configurationComplete: boolean;
  providersActivated: boolean;
  activation: "disabled_in_demo" | "configuration_required" | "disabled_by_operator" | "hosted_verification_required";
  controls: {
    enforceable: boolean;
    verification: "not_applicable" | "configuration_required" | "hosted_required";
  };
  providers: ResearchProviderConfiguration;
  missing: Array<"activation" | "worker" | "apify" | "firecrawl">;
};

type ReadinessEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | "NEXT_PUBLIC_DEMO_MODE"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "PAID_RESEARCH_PROVIDERS_ENABLED"
  | "APIFY_API_TOKEN"
  | "FIRECRAWL_API_KEY"
>>;

export function paidResearchProvidersEnabled(env: Pick<ReadinessEnvironment, "PAID_RESEARCH_PROVIDERS_ENABLED"> = process.env as ReadinessEnvironment): boolean {
  return env.PAID_RESEARCH_PROVIDERS_ENABLED === "true";
}

/**
 * Reports configuration capability without reading, returning, or validating any
 * credential value. Hosted database controls still require the runbook checks;
 * environment presence alone must never be presented as release approval.
 */
export function researchSafetyReadiness(
  env: ReadinessEnvironment = process.env as ReadinessEnvironment,
): ResearchSafetyReadiness {
  const mode = env.NEXT_PUBLIC_DEMO_MODE === "false" ? "connected" : "demo";
  const workerConfigured = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL
      && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      && env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const apifyConfigured = Boolean(env.APIFY_API_TOKEN);
  const firecrawlConfigured = Boolean(env.FIRECRAWL_API_KEY);
  const missing: ResearchSafetyReadiness["missing"] = [];

  if (!workerConfigured) missing.push("worker");
  if (!apifyConfigured) missing.push("apify");
  if (!firecrawlConfigured) missing.push("firecrawl");
  const providersActivated = mode === "connected" && paidResearchProvidersEnabled(env);

  const configurationComplete = mode === "connected" && missing.length === 0;
  const controlsEnforceable = mode === "connected" && workerConfigured;

  return {
    mode,
    configurationComplete,
    providersActivated,
    activation: mode === "demo"
      ? "disabled_in_demo"
      : !configurationComplete
        ? "configuration_required"
        : providersActivated
          ? "hosted_verification_required"
          : "disabled_by_operator",
    controls: {
      enforceable: controlsEnforceable,
      verification: mode === "demo"
        ? "not_applicable"
        : controlsEnforceable
          ? "hosted_required"
          : "configuration_required",
    },
    providers: {
      apify: apifyConfigured ? "configured" : "configuration_required",
      firecrawl: firecrawlConfigured ? "configured" : "configuration_required",
    },
    missing: [...(!providersActivated && mode === "connected" ? ["activation" as const] : []), ...missing],
  };
}
