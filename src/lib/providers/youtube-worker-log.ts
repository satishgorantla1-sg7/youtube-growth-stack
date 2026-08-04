const SAFE_WORKER_CODES = new Set([
  "youtube_worker_configuration_missing",
  "youtube_provider_disabled",
  "youtube_daily_quota_exceeded",
  "provider_rate_limit_exceeded",
]);

export function safeYouTubeWorkerErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return SAFE_WORKER_CODES.has(message) ? message : "youtube_worker_iteration_failed";
}
