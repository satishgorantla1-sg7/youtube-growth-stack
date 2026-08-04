import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { ResearchSource } from "@/lib/providers/types";
import type { ResearchRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { createResearchPlan } from "./cost";
import type {
  ApprovalResult, ProviderInvocation, ProviderInvocationResult, ResearchJob, ResearchJobRepository, ResearchRun,
  ResearchSafetyRepository,
} from "./contracts";

const providerInvocationSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["started", "succeeded", "failed", "cancelled"]),
  created: z.boolean(),
});
const cancellationSchema = z.boolean();
const unsafeMetadataKeys = new Set(["prompt", "content", "token", "api_key", "authorization", "transcript"]);
const safeMetadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .refine((metadata) => Object.keys(metadata).every((key) => !unsafeMetadataKeys.has(key)), "unsafe_provider_metadata");

export class SupabaseResearchJobRepository implements ResearchJobRepository {
  async createOrGet(input: ResearchRequest): Promise<ResearchRun> {
    if (!input.workspaceId) throw new Error("workspace_required");
    const client = await createClient();
    const { data: userData, error: authError } = await client.auth.getUser();
    if (authError || !userData.user) throw new Error("authentication_required");
    const plan = createResearchPlan(input);
    const { data, error } = await client.rpc("create_research_run", {
      target_workspace_id: input.workspaceId, request_prompt: plan.prompt, request_mode: plan.mode,
      request_sources: plan.sources, request_max_sources: plan.maxSources,
      request_estimated_credits: plan.estimatedCredits, request_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return data as unknown as ResearchRun;
  }

  async decideApproval(input: { approvalId: string; decision: "approved" | "rejected"; note?: string }): Promise<ApprovalResult> {
    const client = await createClient();
    const { data: userData, error: authError } = await client.auth.getUser();
    if (authError || !userData.user) throw new Error("authentication_required");
    const { data, error } = await client.rpc("decide_research_approval", {
      target_approval_id: input.approvalId, approval_decision: input.decision, approval_note: input.note,
    });
    if (error) throw new Error(error.message);
    return data as unknown as ApprovalResult;
  }

  async lease(): Promise<ResearchJob | null> {
    throw new Error("Use the service-role RPC worker contract to lease production jobs.");
  }
  async ack(): Promise<void> {
    throw new Error("Use the service-role RPC worker contract to acknowledge production jobs.");
  }
  async fail(): Promise<"queued" | "dead_letter" | "cancelled"> {
    throw new Error("Use the service-role RPC worker contract to fail production jobs.");
  }
}

export class SupabaseResearchWorkerRepository implements ResearchSafetyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createOrGet(): Promise<ResearchRun> {
    throw new Error("Worker credentials cannot create user research runs.");
  }
  async decideApproval(): Promise<ApprovalResult> {
    throw new Error("Worker credentials cannot approve research runs.");
  }
  async lease(workerId: string, leaseSeconds: number): Promise<ResearchJob | null> {
    const { data, error } = await this.client.rpc("lease_research_job", { worker_id: workerId, lease_seconds: leaseSeconds });
    if (error) throw new Error(error.message);
    return data as unknown as ResearchJob | null;
  }
  async ack(job: ResearchJob, sources: ResearchSource[]): Promise<void> {
    const normalized = sources.map((source) => ({
      provider: source.provider, source_type: source.type, url: source.url, title: source.title,
      content: source.text, provenance: { ...source.provenance, correlation_id: job.correlationId },
      captured_at: source.capturedAt,
    }));
    const { error } = await this.client.rpc("ack_research_job", {
      target_job_id: job.id, target_lease_token: job.leaseToken, normalized_sources: normalized,
    });
    if (error) throw new Error(error.message);
  }
  async fail(job: ResearchJob, errorCode: string, retryable: boolean): Promise<"queued" | "dead_letter" | "cancelled"> {
    const { data, error } = await this.client.rpc("fail_research_job", {
      target_job_id: job.id, target_lease_token: job.leaseToken,
      failure_code: errorCode, is_retryable: retryable,
    });
    if (error) throw new Error(error.message);
    return z.enum(["queued", "dead_letter", "cancelled"]).parse(data);
  }
  async beginProviderInvocation(job: ResearchJob, input: {
    provider: "apify" | "firecrawl";
    operation: string;
    requestedUnits: number;
    idempotencyKey: string;
  }): Promise<ProviderInvocation> {
    const { data, error } = await this.client.rpc("begin_provider_invocation", {
      target_job_id: job.id,
      target_lease_token: job.leaseToken,
      target_provider: input.provider,
      target_operation: input.operation,
      target_requested_units: input.requestedUnits,
      request_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return providerInvocationSchema.parse(data);
  }
  async finishProviderInvocation(invocationId: string, result: ProviderInvocationResult): Promise<void> {
    const safeMetadata = safeMetadataSchema.parse(result.metadata ?? {});
    const { error } = await this.client.rpc("finish_provider_invocation", {
      target_invocation_id: invocationId,
      target_state: result.state,
      target_actual_units: result.actualUnits,
      target_credits: result.credits,
      target_provider_cost_usd: undefined,
      target_error_code: result.errorCode,
      safe_metadata: safeMetadata,
    });
    if (error) throw new Error(error.message);
  }
  async settleUsage(job: ResearchJob, actualCredits: number): Promise<void> {
    const { error } = await this.client.rpc("settle_research_usage", {
      target_job_id: job.id,
      target_lease_token: job.leaseToken,
      target_actual_credits: actualCredits,
    });
    if (error) throw new Error(error.message);
  }
  async cancellationRequested(job: ResearchJob): Promise<boolean> {
    const { data, error } = await this.client.rpc("research_cancellation_requested", {
      target_job_id: job.id,
      target_lease_token: job.leaseToken,
    });
    if (error) throw new Error(error.message);
    return cancellationSchema.parse(data);
  }
  async acknowledgeCancellation(job: ResearchJob, actualCredits: number): Promise<void> {
    const { error } = await this.client.rpc("acknowledge_research_cancellation", {
      target_job_id: job.id,
      target_lease_token: job.leaseToken,
      target_actual_credits: actualCredits,
    });
    if (error) throw new Error(error.message);
  }
}

export function createSupabaseWorkerRepository(): SupabaseResearchWorkerRepository {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase worker configuration is missing.");
  const client = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return new SupabaseResearchWorkerRepository(client);
}
