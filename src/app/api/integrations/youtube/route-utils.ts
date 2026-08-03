import { NextResponse } from "next/server";
import { YoutubeLifecycleError } from "@/lib/youtube/lifecycle-controls";

export function youtubeLifecycleErrorResponse(error: unknown) {
  const code = error instanceof YoutubeLifecycleError ? error.code : "youtube_lifecycle_unavailable";
  const status = code === "authentication_required" ? 401
    : code === "youtube_lifecycle_forbidden" ? 403
      : code === "approval_required" || code === "approval_not_pending" || code === "youtube_sync_conflict" ? 409
        : code === "youtube_sync_disabled" ? 503 : 503;
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}
