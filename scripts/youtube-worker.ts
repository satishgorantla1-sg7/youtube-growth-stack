import { runProductionYouTubeSyncOnce } from "../src/lib/providers/youtube-sync-worker";

const workerId = process.env.YOUTUBE_WORKER_ID ?? `youtube-${process.pid}`;
const pollMs = 5_000;
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    const result = await runProductionYouTubeSyncOnce(workerId);
    if (result === "idle" || result === "requeued") await new Promise((resolve) => setTimeout(resolve, pollMs));
  } catch (error) {
    const message = error instanceof Error ? error.message : "youtube_worker_iteration_failed";
    console.error(JSON.stringify({ event: "youtube_worker_error", workerId, message }));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

console.info(JSON.stringify({ event: "youtube_worker_stopped", workerId }));
