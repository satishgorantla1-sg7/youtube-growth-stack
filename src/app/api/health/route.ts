import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { researchSafetyReadiness } from "@/lib/research/safety-readiness";

export function GET() {
  const env = serverEnv();
  const research = researchSafetyReadiness();
  return NextResponse.json({
    ok: true, service: "youtube-growth-stack",
    mode: research.mode,
    providers: {
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      apify: research.providers.apify,
      firecrawl: research.providers.firecrawl,
      paidResearchEnabled: research.providersActivated,
    },
    research,
  });
}
