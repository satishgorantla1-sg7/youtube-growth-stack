import { hasSupabaseConfig, isDemoMode, serverEnv } from "@/lib/env";
import { ApifyYouTubeProvider } from "@/lib/providers/apify";
import { DemoResearchProvider } from "@/lib/providers/demo";
import { FirecrawlProvider } from "@/lib/providers/firecrawl";
import { ProviderError, type ResearchProvider, type ResearchSource, type SourceType } from "@/lib/providers/types";

export type ResearchReadiness = {
  ready: boolean;
  missing: Array<"apify" | "firecrawl" | "worker">;
};

export function researchReadiness(requested: SourceType[] = ["youtube", "web"]): ResearchReadiness {
  if (isDemoMode()) return { ready: true, missing: [] };
  const env = serverEnv();
  const missing: ResearchReadiness["missing"] = [];
  if (requested.includes("youtube") && !env.APIFY_API_TOKEN) missing.push("apify");
  if (requested.includes("web") && !env.FIRECRAWL_API_KEY) missing.push("firecrawl");
  if (hasSupabaseConfig() && !env.SUPABASE_SERVICE_ROLE_KEY) missing.push("worker");
  return { ready: missing.length === 0, missing };
}

export async function runResearch(query: string, requested: SourceType[], requestedLimit?: number): Promise<ResearchSource[]> {
  const env = serverEnv();
  const boundedLimit = Math.min(requestedLimit ?? env.MAX_RESEARCH_SOURCES, env.MAX_RESEARCH_SOURCES, 25);
  if (isDemoMode()) {
    const sources = await new DemoResearchProvider().research(query);
    return sources.filter((source) => requested.includes(source.type)).slice(0, boundedLimit);
  }

  const readiness = researchReadiness(requested);
  if (!readiness.ready) throw new ProviderError("research_configuration_missing", true);

  const configured: ResearchProvider[] = [
    ...(requested.includes("youtube") ? [new ApifyYouTubeProvider(env.APIFY_API_TOKEN, env.APIFY_YOUTUBE_ACTOR_ID)] : []),
    ...(requested.includes("web") ? [new FirecrawlProvider(env.FIRECRAWL_API_KEY)] : []),
  ].filter((provider) => provider.isConfigured());
  const providers: ResearchProvider[] = configured;
  const limit = Math.max(1, Math.floor(boundedLimit / providers.length));
  const batches = await Promise.all(providers.map((provider) => provider.research(query, limit)));
  return batches.flat().filter((source) => requested.includes(source.type)).slice(0, boundedLimit);
}
