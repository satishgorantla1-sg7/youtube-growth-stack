import { NextResponse } from "next/server";
import { authorizeYoutubeLifecycleRequest, requestYoutubeSync, requestYoutubeSyncSchema } from "@/lib/youtube/lifecycle-controls";
import { youtubeLifecycleErrorResponse } from "../route-utils";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "json_required" }, { status: 415 });
  }
  try {
    const client = await authorizeYoutubeLifecycleRequest();
    const parsed = requestYoutubeSyncSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_youtube_sync_request" }, { status: 400 });
    const run = await requestYoutubeSync(client, parsed.data);
    return NextResponse.json(run, { status: run.created ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return youtubeLifecycleErrorResponse(error); }
}
