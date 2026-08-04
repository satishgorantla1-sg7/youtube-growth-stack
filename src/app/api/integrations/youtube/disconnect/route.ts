import { NextResponse } from "next/server";
import { authorizeYoutubeLifecycleRequest, youtubeDisconnectSchema } from "@/lib/youtube/lifecycle-controls";
import { disconnectYoutube } from "@/lib/youtube/youtube-disconnect-server";
import { youtubeLifecycleErrorResponse } from "../route-utils";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 });
  try {
    const client = await authorizeYoutubeLifecycleRequest();
    const parsed = youtubeDisconnectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_youtube_disconnect_request" }, { status: 400 });
    return NextResponse.json(await disconnectYoutube(client, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return youtubeLifecycleErrorResponse(error); }
}
