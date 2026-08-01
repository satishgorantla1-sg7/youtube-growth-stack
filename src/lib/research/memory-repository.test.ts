import { describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/providers/types";
import { MemoryResearchJobRepository } from "./memory-repository";
import { runWorkerOnce } from "./worker";

const request = {
  prompt: "Find durable research opportunities",
  mode: "deep" as const,
  sources: ["youtube", "web"] as ("youtube" | "web")[],
  maxSources: 25,
  idempotencyKey: "research-request-123",
};

describe("durable research jobs", () => {
  it("returns the same awaiting-approval run for an idempotent retry", async () => {
    const repository = new MemoryResearchJobRepository();
    const first = await repository.createOrGet(request);
    const retry = await repository.createOrGet(request);
    expect(first).toMatchObject({ state: "awaiting_approval", created: true });
    expect(retry).toMatchObject({ id: first.id, approvalId: first.approvalId, created: false });
    expect(first.plan.estimatedCredits).toBeLessThanOrEqual(100);
  });

  it("rejects reuse of an idempotency key for a different plan", async () => {
    const repository = new MemoryResearchJobRepository();
    await repository.createOrGet(request);
    await expect(repository.createOrGet({ ...request, prompt: "A different scope" })).rejects.toThrow("idempotency_conflict");
  });

  it("cannot lease paid work before explicit approval", async () => {
    const repository = new MemoryResearchJobRepository();
    const run = await repository.createOrGet({ ...request, idempotencyKey: "research-request-approval" });
    expect(await repository.lease("worker-1", 60)).toBeNull();
    await repository.decideApproval({ approvalId: run.approvalId, decision: "approved" });
    expect(await repository.lease("worker-1", 60)).toMatchObject({ runId: run.id, attempt: 1 });
    await expect(repository.decideApproval({ approvalId: run.approvalId, decision: "approved" })).rejects.toThrow("approval_not_pending");
  });

  it("retries bounded failures and then dead-letters", async () => {
    const repository = new MemoryResearchJobRepository();
    const run = await repository.createOrGet({ ...request, idempotencyKey: "research-request-retry" });
    await repository.decideApproval({ approvalId: run.approvalId, decision: "approved" });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const job = await repository.lease("worker-1", 60);
      expect(job).not.toBeNull();
      await expect(repository.fail(job!, "provider_unavailable", true)).resolves.toBe("queued");
    }
    const finalJob = await repository.lease("worker-1", 60);
    await expect(repository.fail(finalJob!, "provider_unavailable", true)).resolves.toBe("dead_letter");
    expect(await repository.lease("worker-1", 60)).toBeNull();
  });

  it("dead-letters a non-retryable provider failure", async () => {
    const repository = new MemoryResearchJobRepository();
    const run = await repository.createOrGet({ ...request, idempotencyKey: "research-request-provider" });
    await repository.decideApproval({ approvalId: run.approvalId, decision: "approved" });
    const result = await runWorkerOnce(repository, "worker-1", async () => {
      throw new ProviderError("provider_invalid_response", false);
    });
    expect(result).toBe("dead_letter");
  });
});
