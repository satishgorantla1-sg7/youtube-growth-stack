import { runProductionWorkerOnce } from "../src/lib/research/worker";
import { parseResearchWorkerPollMs } from "../src/lib/research/worker-config";

const workerId = process.env.RESEARCH_WORKER_ID ?? `research-${process.pid}`;
const pollMs = parseResearchWorkerPollMs(process.env.RESEARCH_WORKER_POLL_MS);
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    const result = await runProductionWorkerOnce(workerId);
    if (result === "idle") await new Promise((resolve) => setTimeout(resolve, pollMs));
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker_iteration_failed";
    console.error(JSON.stringify({ event: "research_worker_error", workerId, message }));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

console.info(JSON.stringify({ event: "research_worker_stopped", workerId }));
