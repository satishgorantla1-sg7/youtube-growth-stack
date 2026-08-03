import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeYoutubeLifecycleRequest, createYoutubeRevocationApproval } from "@/lib/youtube/lifecycle-controls";
import { youtubeLifecycleErrorResponse } from "../route-utils";

const schema = z.object({ workspaceId: z.string().uuid() }).strict();
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 });
  try {
    const client = await authorizeYoutubeLifecycleRequest();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_youtube_revocation_approval" }, { status: 400 });
    const approval = await createYoutubeRevocationApproval(client, parsed.data.workspaceId);
    return NextResponse.json(approval, { status: approval.reused ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return youtubeLifecycleErrorResponse(error); }
}
