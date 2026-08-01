import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authorizeYoutubeApprovalRequest,
  decideYoutubeApprovalSchema,
  decideYoutubeConnectionApproval,
  YoutubeApprovalError,
} from "@/lib/youtube/approvals";

const approvalIdSchema = z.string().uuid();

function errorResponse(error: unknown) {
  const code = error instanceof YoutubeApprovalError ? error.code : "youtube_approval_unavailable";
  const status = code === "authentication_required" ? 401
    : code === "youtube_approval_forbidden" ? 403
      : code === "approval_not_pending" ? 409 : 503;
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ approvalId: string }> }) {
  let client;
  try {
    client = await authorizeYoutubeApprovalRequest();
  } catch (error) {
    return errorResponse(error);
  }

  const approvalId = approvalIdSchema.safeParse((await context.params).approvalId);
  if (!approvalId.success) return NextResponse.json({ error: "invalid_youtube_approval_id" }, { status: 400 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "json_required" }, { status: 415 });
  }
  const parsed = decideYoutubeApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_youtube_approval_decision" }, { status: 400 });

  try {
    const approval = await decideYoutubeConnectionApproval(client, approvalId.data, parsed.data);
    return NextResponse.json(approval, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
