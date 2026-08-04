import { runProductionYouTubeSyncOnce } from "../src/lib/providers/youtube-sync-worker";
import { safeYouTubeWorkerErrorCode } from "../src/lib/providers/youtube-worker-log";

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
    console.error(JSON.stringify({ event: "youtube_worker_error", workerId, code: safeYouTubeWorkerErrorCode(error) }));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

console.info(JSON.stringify({ event: "youtube_worker_stopped", workerId }));
