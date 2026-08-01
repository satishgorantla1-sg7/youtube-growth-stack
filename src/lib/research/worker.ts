import { ProviderError } from "@/lib/providers/types";
import type { ResearchJobRepository } from "./contracts";
import { runResearch } from "./orchestrator";
import { createSupabaseWorkerRepository } from "./supabase-repository";

type ResearchExecutor = typeof runResearch;

export async function runWorkerOnce(repository: ResearchJobRepository, workerId: string, execute: ResearchExecutor = runResearch): Promise<"idle" | "completed" | "queued" | "dead_letter"> {
  const job = await repository.lease(workerId, 60);
  if (!job) return "idle";
  try {
    const sources = await execute(job.plan.prompt, job.plan.sources, job.plan.maxSources);
    await repository.ack(job, sources);
    return "completed";
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : new ProviderError("research_failed", false);
    return repository.fail(job, providerError.code, providerError.retryable);
  }
}

export async function runProductionWorkerOnce(workerId: string) {
  return runWorkerOnce(createSupabaseWorkerRepository(), workerId);
}
