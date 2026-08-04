import { hasSupabaseConfig, serverEnv } from "@/lib/env";
import type { SourceType } from "@/lib/providers/types";
import { researchJobRepository } from "./repository";
import { researchReadiness } from "./orchestrator";
import { runProductionWorkerOnce, runWorkerOnce } from "./worker";

export type DispatchResult = {
  state: "configuration_required" | "idle" | "completed" | "queued" | "dead_letter" | "cancelled";
  missing: Array<"apify" | "firecrawl" | "worker">;
};

export function researchDispatchStatus(requested: SourceType[] = ["youtube", "web"]): DispatchResult {
  const readiness = researchReadiness(requested);
  return readiness.ready
    ? { state: "idle", missing: [] }
    : { state: "configuration_required", missing: readiness.missing };
}

export async function dispatchResearchWorker(requested: SourceType[] = ["youtube", "web"]): Promise<DispatchResult> {
  const status = researchDispatchStatus(requested);
  if (status.state === "configuration_required") return status;
  const workerId = `${serverEnv().RESEARCH_WORKER_ID}-${crypto.randomUUID()}`;
  const state = hasSupabaseConfig()
    ? await runProductionWorkerOnce(workerId)
    : await runWorkerOnce(researchJobRepository(), workerId);
  return { state, missing: [] };
}
