import { ProviderError, type ResearchSource, type SourceType } from "@/lib/providers/types";
import type {
  PaidResearchProvider, ProviderInvocationResult, ResearchJob, ResearchJobRepository, ResearchSafetyRepository,
} from "./contracts";
import { researchCreditsForUnits } from "./cost";
import { runResearch } from "./orchestrator";
import { createSupabaseWorkerRepository } from "./supabase-repository";

type ResearchExecutor = (
  query: string,
  requested: SourceType[],
  requestedLimit?: number,
  signal?: AbortSignal,
) => Promise<ResearchSource[]>;

type WorkerResult = "idle" | "completed" | "queued" | "dead_letter" | "cancelled";

const RETRYABLE_CONTROL_ERRORS = [
  "research_disabled",
  "research_provider_disabled",
  "global_concurrency_limit_exceeded",
  "provider_concurrency_limit_exceeded",
  "workspace_concurrency_limit_exceeded",
] as const;

function isSafetyRepository(repository: ResearchJobRepository): repository is ResearchSafetyRepository {
  return "beginProviderInvocation" in repository
    && "finishProviderInvocation" in repository
    && "settleUsage" in repository
    && "cancellationRequested" in repository
    && "acknowledgeCancellation" in repository;
}

function safeWorkerError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = error instanceof Error ? error.message : "";
  const controlCode = RETRYABLE_CONTROL_ERRORS.find((code) => message.includes(code));
  if (controlCode) return new ProviderError(controlCode, true);
  if (message.includes("research_cancellation_requested")) return new ProviderError("research_cancellation_requested", false);
  if (message.includes("lease_lost")) return new ProviderError("lease_lost", true);
  return new ProviderError("research_failed", false);
}

function providerFor(source: SourceType): PaidResearchProvider {
  return source === "youtube" ? "apify" : "firecrawl";
}

async function cancellationAwareExecution(
  repository: ResearchSafetyRepository,
  job: ResearchJob,
  execute: ResearchExecutor,
  source: SourceType,
  limit: number,
): Promise<ResearchSource[]> {
  const controller = new AbortController();
  let polling = false;
  const interval = setInterval(() => {
    if (polling || controller.signal.aborted) return;
    polling = true;
    void repository.cancellationRequested(job)
      .then((cancelled) => { if (cancelled) controller.abort("research_cancellation_requested"); })
      .catch(() => undefined)
      .finally(() => { polling = false; });
  }, 1_000);
  try {
    return await execute(job.plan.prompt, [source], limit, controller.signal);
  } finally {
    clearInterval(interval);
  }
}

async function executePaidProvider(
  repository: ResearchSafetyRepository,
  job: ResearchJob,
  execute: ResearchExecutor,
  source: SourceType,
  requestedUnits: number,
  recordCredits: (credits: number) => void,
): Promise<ResearchSource[]> {
  const provider = providerFor(source);
  const invocation = await repository.beginProviderInvocation(job, {
    provider,
    operation: source === "youtube" ? "youtube.search" : "web.search",
    requestedUnits,
    idempotencyKey: `${job.id}:${job.attempt}:${provider}`,
  });
  if (!invocation.created || invocation.state !== "started") {
    throw new ProviderError("provider_invocation_not_startable", false);
  }

  let result: ProviderInvocationResult = {
    state: "failed",
    actualUnits: 0,
    credits: researchCreditsForUnits(requestedUnits, job.plan.mode),
    errorCode: "research_failed",
  };
  try {
    const sources = await cancellationAwareExecution(repository, job, execute, source, requestedUnits);
    const actualUnits = Math.min(sources.length, requestedUnits, 25);
    const credits = researchCreditsForUnits(actualUnits, job.plan.mode);
    result = { state: "succeeded", actualUnits, credits, metadata: { source_type: source } };
    return sources;
  } catch (error) {
    const safeError = safeWorkerError(error);
    if (await repository.cancellationRequested(job).catch(() => false)) {
      result = { ...result, state: "cancelled", errorCode: "research_cancellation_requested" };
      throw new ProviderError("research_cancellation_requested", false);
    }
    result = { ...result, errorCode: safeError.code };
    throw safeError;
  } finally {
    recordCredits(result.credits);
    await repository.finishProviderInvocation(invocation.id, result);
  }
}

async function runSafetyWorker(
  repository: ResearchSafetyRepository,
  job: ResearchJob,
  execute: ResearchExecutor,
): Promise<Exclude<WorkerResult, "idle">> {
  let actualCredits = 0;
  try {
    if (await repository.cancellationRequested(job)) {
      await repository.acknowledgeCancellation(job, 0);
      return "cancelled";
    }
    const perProviderLimit = Math.max(1, Math.floor(job.plan.maxSources / job.plan.sources.length));
    const sources: ResearchSource[] = [];
    for (const source of job.plan.sources) {
      if (await repository.cancellationRequested(job)) {
        await repository.acknowledgeCancellation(job, actualCredits);
        return "cancelled";
      }
      const batch = await executePaidProvider(repository, job, execute, source, perProviderLimit, (credits) => { actualCredits += credits; });
      sources.push(...batch);
    }
    if (await repository.cancellationRequested(job)) {
      await repository.acknowledgeCancellation(job, actualCredits);
      return "cancelled";
    }
    await repository.settleUsage(job, actualCredits);
    await repository.ack(job, sources.slice(0, job.plan.maxSources));
    return "completed";
  } catch (error) {
    const providerError = safeWorkerError(error);
    if (providerError.code === "research_cancellation_requested") {
      await repository.acknowledgeCancellation(job, actualCredits);
      return "cancelled";
    }
    if (providerError.code === "lease_lost") return "queued";
    return repository.fail(job, providerError.code, providerError.retryable);
  }
}

export async function runWorkerOnce(
  repository: ResearchJobRepository,
  workerId: string,
  execute: ResearchExecutor = runResearch,
): Promise<WorkerResult> {
  const job = await repository.lease(workerId, 180);
  if (!job) return "idle";
  if (isSafetyRepository(repository)) return runSafetyWorker(repository, job, execute);
  try {
    const sources = await execute(job.plan.prompt, job.plan.sources, job.plan.maxSources);
    await repository.ack(job, sources);
    return "completed";
  } catch (error) {
    const providerError = safeWorkerError(error);
    return repository.fail(job, providerError.code, providerError.retryable);
  }
}

export async function runProductionWorkerOnce(workerId: string) {
  return runWorkerOnce(createSupabaseWorkerRepository(), workerId);
}
