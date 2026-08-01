const DEFAULT_POLL_MS = 2_000;

export function parseResearchWorkerPollMs(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_POLL_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_MS;
  return Math.min(Math.max(parsed, 250), 30_000);
}
