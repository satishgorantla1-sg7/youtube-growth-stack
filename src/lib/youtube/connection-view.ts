import type { YouTubeSyncStatusRow } from "@/lib/dashboard/contracts";

export type YouTubeSyncViewOverride = "refreshing" | "quota_limited" | null;

export function youtubeSyncViewOverride(latest: YouTubeSyncStatusRow | null): YouTubeSyncViewOverride {
  if (!latest) return null;
  if (latest.state === "queued" || latest.state === "running") return "refreshing";
  if (latest.state === "failed" && latest.last_error_code === "youtube_daily_quota_exceeded") return "quota_limited";
  return null;
}
