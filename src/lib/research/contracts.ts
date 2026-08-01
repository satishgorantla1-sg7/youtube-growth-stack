import type { ResearchRequest } from "@/lib/schemas";
import type { ResearchSource } from "@/lib/providers/types";

export type ResearchPlan = {
  prompt: string;
  mode: ResearchRequest["mode"];
  sources: ResearchRequest["sources"];
  maxSources: number;
  estimatedCredits: number;
};

export type ResearchRun = {
  id: string;
  approvalId: string;
  workspaceId: string;
  correlationId: string;
  idempotencyKey: string;
  state: "awaiting_approval" | "queued" | "running" | "completed" | "failed" | "cancelled";
  plan: ResearchPlan;
  created: boolean;
};

export type ResearchJob = {
  id: string;
  runId: string;
  workspaceId: string;
  correlationId: string;
  state: "leased";
  attempt: number;
  maxAttempts: number;
  leaseToken: string;
  plan: ResearchPlan;
};

export type ApprovalResult = {
  approvalId: string;
  runId: string;
  state: "queued" | "cancelled";
  jobId?: string;
  correlationId: string;
  decidedAt: string;
};

export interface ResearchJobRepository {
  createOrGet(input: ResearchRequest): Promise<ResearchRun>;
  decideApproval(input: { approvalId: string; decision: "approved" | "rejected"; note?: string }): Promise<ApprovalResult>;
  lease(workerId: string, leaseSeconds: number): Promise<ResearchJob | null>;
  ack(job: ResearchJob, sources: ResearchSource[]): Promise<void>;
  fail(job: ResearchJob, errorCode: string, retryable: boolean): Promise<"queued" | "dead_letter">;
}
