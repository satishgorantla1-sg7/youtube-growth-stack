import type { ResearchSource } from "@/lib/providers/types";
import type { ResearchRequest } from "@/lib/schemas";
import { createResearchPlan } from "./cost";
import type { ApprovalResult, ResearchJob, ResearchJobRepository, ResearchRun } from "./contracts";

type StoredJob = Omit<ResearchJob, "state"> & { state: "queued" | "leased" | "completed" | "dead_letter" };

export class MemoryResearchJobRepository implements ResearchJobRepository {
  private readonly runs = new Map<string, ResearchRun>();
  private readonly approvals = new Map<string, { runId: string; state: "pending" | "approved" | "rejected" }>();
  private readonly jobs = new Map<string, StoredJob>();
  private readonly sources = new Map<string, ResearchSource[]>();

  async createOrGet(input: ResearchRequest): Promise<ResearchRun> {
    const existing = this.runs.get(input.idempotencyKey);
    if (existing) {
      const plan = createResearchPlan(input);
      if (existing.plan.prompt !== plan.prompt || existing.plan.mode !== plan.mode
        || existing.plan.maxSources !== plan.maxSources
        || existing.plan.sources.join(",") !== plan.sources.join(",")) throw new Error("idempotency_conflict");
      return { ...existing, created: false };
    }
    const id = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const run: ResearchRun = {
      id, approvalId,
      workspaceId: input.workspaceId ?? "00000000-0000-0000-0000-000000000001",
      correlationId: crypto.randomUUID(), idempotencyKey: input.idempotencyKey,
      state: "awaiting_approval", plan: createResearchPlan(input), created: true,
    };
    this.runs.set(input.idempotencyKey, run);
    this.approvals.set(approvalId, { runId: id, state: "pending" });
    return run;
  }

  async decideApproval(input: { approvalId: string; decision: "approved" | "rejected"; note?: string }): Promise<ApprovalResult> {
    const approval = this.approvals.get(input.approvalId);
    if (!approval || approval.state !== "pending") throw new Error("approval_not_pending");
    const run = [...this.runs.values()].find((candidate) => candidate.id === approval.runId);
    if (!run || run.state !== "awaiting_approval") throw new Error("approval_bypass_prevented");
    approval.state = input.decision;
    const decidedAt = new Date().toISOString();
    if (input.decision === "rejected") {
      run.state = "cancelled";
      return { approvalId: input.approvalId, runId: run.id, state: "cancelled", correlationId: run.correlationId, decidedAt };
    }
    run.state = "queued";
    const jobId = crypto.randomUUID();
    this.jobs.set(jobId, {
      id: jobId, runId: run.id, workspaceId: run.workspaceId, correlationId: run.correlationId,
      state: "queued", attempt: 0, maxAttempts: 3, leaseToken: "", plan: run.plan,
    });
    return { approvalId: input.approvalId, runId: run.id, state: "queued", jobId, correlationId: run.correlationId, decidedAt };
  }

  async lease(workerId: string, leaseSeconds: number): Promise<ResearchJob | null> {
    void workerId;
    void leaseSeconds;
    const job = [...this.jobs.values()].find((candidate) => candidate.state === "queued");
    if (!job) return null;
    const approval = [...this.approvals.values()].find((candidate) => candidate.runId === job.runId);
    if (approval?.state !== "approved") throw new Error("approval_bypass_prevented");
    job.state = "leased";
    job.attempt += 1;
    job.leaseToken = crypto.randomUUID();
    return { ...job, state: "leased" };
  }

  async ack(job: ResearchJob, sources: ResearchSource[]) {
    this.sources.set(job.runId, sources);
    const stored = this.assertLease(job);
    stored.state = "completed";
    const run = [...this.runs.values()].find((candidate) => candidate.id === job.runId);
    if (run) run.state = "completed";
  }

  async fail(job: ResearchJob, _errorCode: string, retryable: boolean): Promise<"queued" | "dead_letter"> {
    const stored = this.assertLease(job);
    stored.state = retryable && stored.attempt < stored.maxAttempts ? "queued" : "dead_letter";
    const run = [...this.runs.values()].find((candidate) => candidate.id === job.runId);
    if (run) run.state = stored.state === "queued" ? "queued" : "failed";
    return stored.state;
  }

  getStatus(runId: string) {
    const run = [...this.runs.values()].find((candidate) => candidate.id === runId);
    if (!run) return null;
    return {
      runId: run.id,
      state: run.state,
      prompt: run.plan.prompt,
      sources: this.sources.get(run.id) ?? [],
    };
  }

  private assertLease(job: ResearchJob): StoredJob {
    const stored = this.jobs.get(job.id);
    if (!stored || stored.state !== "leased" || stored.leaseToken !== job.leaseToken) throw new Error("lease_lost");
    return stored;
  }
}
