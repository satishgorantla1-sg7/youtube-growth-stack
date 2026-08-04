import type { YouTubeSyncStatusRow } from "@/lib/dashboard/contracts";
import type { YouTubeWorkerStatus } from "@/lib/providers/youtube-worker-health";

export type YouTubeSyncExecutionState = "idle" | "queued" | "running" | "stalled" | "complete" | "failed";

const QUEUED_STALL_MS = 2 * 60 * 1000;

export function youtubeSyncExecutionState(
  latest: YouTubeSyncStatusRow | null,
  worker: YouTubeWorkerStatus,
  now = new Date(),
): YouTubeSyncExecutionState {
  if (!latest) return "idle";
  if (latest.state === "completed") return "complete";
  if (latest.state === "failed" || latest.state === "cancelled") return "failed";
  const workerUnavailable = worker.status !== "healthy";
  if (latest.state === "running") {
    const leaseExpired = !latest.lease_expires_at || Date.parse(latest.lease_expires_at) <= now.getTime();
    return workerUnavailable || leaseExpired ? "stalled" : "running";
  }
  if (latest.state === "queued") {
    const queuedTooLong = now.getTime() - Date.parse(latest.created_at) >= QUEUED_STALL_MS;
    return queuedTooLong && workerUnavailable ? "stalled" : "queued";
  }
  return "failed";
}
