import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export function GET() {
  const env = serverEnv();
  return NextResponse.json({
    ok: true, service: "youtube-growth-stack",
    mode: process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? "connected" : "demo",
    providers: { openai: Boolean(env.OPENAI_API_KEY), firecrawl: Boolean(env.FIRECRAWL_API_KEY), apify: Boolean(env.APIFY_API_TOKEN) },
  });
}
