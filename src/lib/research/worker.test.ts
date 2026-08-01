import { describe, expect, it, vi } from "vitest";
import { ProviderError, type ResearchSource, type SourceType } from "@/lib/providers/types";
import type {
  ApprovalResult, ProviderInvocationResult, ResearchJob, ResearchRun, ResearchSafetyRepository,
} from "./contracts";
import { runWorkerOnce } from "./worker";

const job: ResearchJob = {
  id: "00000000-0000-4000-8000-000000000101",
  runId: "00000000-0000-4000-8000-000000000102",
  workspaceId: "00000000-0000-4000-8000-000000000103",
  correlationId: "00000000-0000-4000-8000-000000000104",
  state: "leased",
  attempt: 1,
  maxAttempts: 3,
  leaseToken: "00000000-0000-4000-8000-000000000105",
  plan: { prompt: "bounded research", mode: "quick", sources: ["youtube", "web"], maxSources: 10, estimatedCredits: 4 },
};

function source(type: SourceType): ResearchSource {
  return {
    provider: type === "youtube" ? "apify" : "firecrawl", type, title: type,
    url: type === "youtube" ? "https://youtube.com/watch?v=test" : "https://example.com/source",
    text: "evidence", capturedAt: "2026-08-01T00:00:00.000Z", provenance: {},
  };
}

function repository(overrides: Partial<ResearchSafetyRepository> = {}) {
  const repo: ResearchSafetyRepository = {
    createOrGet: vi.fn<() => Promise<ResearchRun>>(),
    decideApproval: vi.fn<() => Promise<ApprovalResult>>(),
    lease: vi.fn(async () => job),
    ack: vi.fn(async () => undefined),
    fail: vi.fn(async () => "dead_letter" as const),
    beginProviderInvocation: vi.fn(async (_job, input) => ({ id: `invocation-${input.provider}`, state: "started" as const, created: true })),
    finishProviderInvocation: vi.fn(async () => undefined),
    settleUsage: vi.fn(async () => undefined),
    cancellationRequested: vi.fn(async () => false),
    acknowledgeCancellation: vi.fn(async () => undefined),
    ...overrides,
  };
  return repo;
}

describe("research safety worker", () => {
  it("never calls a provider when no approved job can be leased", async () => {
    const repo = repository({ lease: vi.fn(async () => null) });
    const execute = vi.fn(async () => [source("youtube")]);
    await expect(runWorkerOnce(repo, "worker", execute)).resolves.toBe("idle");
    expect(execute).not.toHaveBeenCalled();
    expect(repo.beginProviderInvocation).not.toHaveBeenCalled();
  });

  it("fails closed before a provider call when a kill switch blocks invocation", async () => {
    const repo = repository({
      beginProviderInvocation: vi.fn(async () => { throw new Error("research_provider_disabled"); }),
      fail: vi.fn(async () => "queued" as const),
    });
    const execute = vi.fn(async () => [source("youtube")]);
    await expect(runWorkerOnce(repo, "worker", execute)).resolves.toBe("queued");
    expect(execute).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(job, "research_provider_disabled", true);
  });

  it("acknowledges cancellation before starting a paid invocation", async () => {
    const repo = repository({ cancellationRequested: vi.fn(async () => true) });
    const execute = vi.fn(async () => [source("youtube")]);
    await expect(runWorkerOnce(repo, "worker", execute)).resolves.toBe("cancelled");
    expect(execute).not.toHaveBeenCalled();
    expect(repo.beginProviderInvocation).not.toHaveBeenCalled();
    expect(repo.acknowledgeCancellation).toHaveBeenCalledWith(job, 0);
  });

  it("finishes a failed invocation and releases its concurrency slot", async () => {
    const repo = repository({ fail: vi.fn(async () => "queued" as const) });
    const execute = vi.fn(async () => { throw new ProviderError("apify_http_500", true); });
    await expect(runWorkerOnce(repo, "worker", execute)).resolves.toBe("queued");
    expect(repo.finishProviderInvocation).toHaveBeenCalledWith("invocation-apify", expect.objectContaining({
      state: "failed", actualUnits: 0, credits: 1, errorCode: "apify_http_500",
    } satisfies Partial<ProviderInvocationResult>));
    expect(repo.fail).toHaveBeenCalledWith(job, "apify_http_500", true);
  });

  it("settles bounded usage after successful provider invocations", async () => {
    const repo = repository();
    const execute = vi.fn(async (_query: string, requested: SourceType[]) => [source(requested[0])]);
    await expect(runWorkerOnce(repo, "worker", execute)).resolves.toBe("completed");
    expect(repo.finishProviderInvocation).toHaveBeenCalledTimes(2);
    expect(repo.settleUsage).toHaveBeenCalledWith(job, 2);
    expect(repo.ack).toHaveBeenCalledWith(job, expect.arrayContaining([source("youtube"), source("web")]));
  });

  it("settles incurred usage and cancels between providers", async () => {
    let checks = 0;
    const repo = repository({ cancellationRequested: vi.fn(async () => ++checks >= 3) });
    const execute = vi.fn(async (_query: string, requested: SourceType[]) => [source(requested[0])]);
    await expect(runWorkerOnce(repo, "worker", execute)).resolves.toBe("cancelled");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repo.acknowledgeCancellation).toHaveBeenCalledWith(job, 1);
  });

  it("aborts a cooperative in-flight provider and preserves its incurred credit", async () => {
    vi.useFakeTimers();
    try {
      let checks = 0;
      let receivedSignal: AbortSignal | undefined;
      const repo = repository({ cancellationRequested: vi.fn(async () => ++checks >= 3) });
      const execute = vi.fn((_query: string, _requested: SourceType[], _limit?: number, signal?: AbortSignal) => {
        receivedSignal = signal;
        return new Promise<ResearchSource[]>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      });
      const work = runWorkerOnce(repo, "worker", execute);
      await vi.advanceTimersByTimeAsync(1_100);
      await expect(work).resolves.toBe("cancelled");
      expect(receivedSignal?.aborted).toBe(true);
      expect(repo.finishProviderInvocation).toHaveBeenCalledWith("invocation-apify", expect.objectContaining({
        state: "cancelled", credits: 1, errorCode: "research_cancellation_requested",
      }));
      expect(repo.acknowledgeCancellation).toHaveBeenCalledWith(job, 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
