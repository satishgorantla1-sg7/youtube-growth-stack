import { serverEnv } from "@/lib/env";
import { ApifyYouTubeProvider } from "@/lib/providers/apify";
import { DemoResearchProvider } from "@/lib/providers/demo";
import { FirecrawlProvider } from "@/lib/providers/firecrawl";
import type { ResearchProvider, ResearchSource, SourceType } from "@/lib/providers/types";

export async function runResearch(query: string, requested: SourceType[], requestedLimit?: number): Promise<ResearchSource[]> {
  const env = serverEnv();
  const configured: ResearchProvider[] = [
    ...(requested.includes("youtube") ? [new ApifyYouTubeProvider(env.APIFY_API_TOKEN, env.APIFY_YOUTUBE_ACTOR_ID)] : []),
    ...(requested.includes("web") ? [new FirecrawlProvider(env.FIRECRAWL_API_KEY)] : []),
  ].filter((provider) => provider.isConfigured());
  const providers: ResearchProvider[] = configured.length ? configured : [new DemoResearchProvider()];
  const boundedLimit = Math.min(requestedLimit ?? env.MAX_RESEARCH_SOURCES, env.MAX_RESEARCH_SOURCES, 25);
  const limit = Math.max(1, Math.floor(boundedLimit / providers.length));
  const batches = await Promise.all(providers.map((provider) => provider.research(query, limit)));
  return batches.flat().filter((source) => requested.includes(source.type)).slice(0, boundedLimit);
}
