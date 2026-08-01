import { NextResponse } from "next/server";
import {
  authorizeYoutubeApprovalRequest,
  createYoutubeApprovalSchema,
  createYoutubeConnectionApproval,
  YoutubeApprovalError,
} from "@/lib/youtube/approvals";

function errorResponse(error: unknown) {
  const code = error instanceof YoutubeApprovalError ? error.code : "youtube_approval_unavailable";
  const status = code === "authentication_required" ? 401
    : code === "youtube_approval_forbidden" ? 403
      : code === "approval_not_pending" ? 409 : 503;
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  let client;
  try {
    client = await authorizeYoutubeApprovalRequest();
  } catch (error) {
    return errorResponse(error);
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "json_required" }, { status: 415 });
  }
  const parsed = createYoutubeApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_youtube_approval_request" }, { status: 400 });

  try {
    const approval = await createYoutubeConnectionApproval(client, parsed.data.workspaceId);
    return NextResponse.json(approval, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
