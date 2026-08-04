import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { readProductionYouTubeWorkerReadiness, type PublicYouTubeWorkerReadiness } from "@/lib/providers/youtube-worker-health";
import { researchSafetyReadiness } from "@/lib/research/safety-readiness";

export async function buildHealthResponse(
  readWorker: () => Promise<PublicYouTubeWorkerReadiness> = readProductionYouTubeWorkerReadiness,
) {
  const env = serverEnv();
  const research = researchSafetyReadiness();
  const youtubeWorker = await readWorker();
  return NextResponse.json({
    ok: true, service: "youtube-growth-stack",
    mode: research.mode,
    providers: {
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      apify: research.providers.apify,
      firecrawl: research.providers.firecrawl,
      paidResearchEnabled: research.providersActivated,
    },
    workers: { youtubeSync: youtubeWorker },
    research,
  });
}

export async function GET() {
  return buildHealthResponse();
}
