import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { DemoContentPackageProvider } from "./demo-provider";
import { generateContentPackage } from "./generation";
import { ContentPackageRepositoryError, SupabaseContentPackageRepository, type PackageRpcClient } from "./repository";

export const packageGenerationInputSchema = z.object({ ideaId: z.string().uuid(), idempotencyKey: z.string().min(8).max(128) }).strict();
export const packageIdInputSchema = z.object({ packageId: z.string().uuid() }).strict();
export const nextPackageInputSchema = z.object({ packageId: z.string().uuid(), idempotencyKey: z.string().min(8).max(128) }).strict();
export const packageDecisionInputSchema = z.object({ approvalId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).nullable().optional() }).strict();

type EvidenceRow = { id: string; title: string | null; content: string | null; url: string };
type IdeaRow = { id: string; title: string; premise: string; status: string };
type QueryResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;
type PackageReadClient = {
  from(table: "ideas"): { select(columns: string): { eq(column: string, value: string): { eq(column: string, value: string): { maybeSingle(): QueryResult<IdeaRow> } } } };
  from(table: "idea_evidence"): { select(columns: string): { eq(column: string, value: string): { eq(column: string, value: string): QueryResult<{ research_source_id: string }[]> } } };
  from(table: "research_sources"): { select(columns: string): { eq(column: string, value: string): { in(column: string, values: string[]): QueryResult<EvidenceRow[]> } } };
};
type RpcResponse = { data: unknown; error: { message?: string } | null };
type AuthenticatedRpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse> };

export class ContentPackageServerError extends Error {
  constructor(readonly code: "package_generation_unavailable" | "content_package_forbidden" | "approved_idea_required" | "invalid_package_evidence" | "content_package_conflict" | "content_package_not_draft" | "content_package_not_versionable" | "approval_not_pending" | "package_action_failed") { super(code); }
}

function serviceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ContentPackageServerError("package_generation_unavailable");
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function mapError(error: unknown): ContentPackageServerError {
  if (error instanceof ContentPackageServerError) return error;
  if (error instanceof ContentPackageRepositoryError) return new ContentPackageServerError(error.code === "content_package_unavailable" ? "package_action_failed" : error.code);
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (message.includes("idea_approval_forbidden") || message.includes("idea_transition_forbidden")) return new ContentPackageServerError("content_package_forbidden");
  const known = ["content_package_forbidden", "approved_idea_required", "content_package_conflict", "content_package_not_draft", "content_package_not_versionable", "approval_not_pending"] as const;
  return new ContentPackageServerError(known.find((code) => message.includes(code)) ?? "package_action_failed");
}

export async function generatePackageForUser(authenticatedClient: SupabaseClient<Database>, input: { workspaceId: string; userId: string; ideaId: string; idempotencyKey: string }, createService = serviceClient) {
  const database = authenticatedClient as unknown as PackageReadClient;
  const ideaResult = await database.from("ideas").select("id,title,premise,status").eq("workspace_id", input.workspaceId).eq("id", input.ideaId).maybeSingle();
  if (ideaResult.error) throw new ContentPackageServerError("content_package_forbidden");
  if (!ideaResult.data || ideaResult.data.status !== "approved") throw new ContentPackageServerError("approved_idea_required");
  const links = await database.from("idea_evidence").select("research_source_id").eq("workspace_id", input.workspaceId).eq("idea_id", input.ideaId);
  if (links.error || !links.data?.length) throw new ContentPackageServerError("invalid_package_evidence");
  const ids = links.data.map(({ research_source_id }) => research_source_id).slice(0, 25);
  const sources = await database.from("research_sources").select("id,title,content,url").eq("workspace_id", input.workspaceId).in("id", ids);
  if (sources.error || !sources.data || sources.data.length !== ids.length) throw new ContentPackageServerError("invalid_package_evidence");
  try {
    const service = createService();
    const content = await generateContentPackage(new DemoContentPackageProvider(), new SupabaseContentPackageRepository(service as unknown as PackageRpcClient), {
      workspaceId: input.workspaceId, ideaId: ideaResult.data.id, ideaTitle: ideaResult.data.title, ideaPremise: ideaResult.data.premise,
      evidence: sources.data, idempotencyKey: input.idempotencyKey, requestedBy: input.userId,
      modelVersion: "evidence-package-preview-v1", promptVersion: "content-package-v1",
    });
    return { content };
  } catch (error) { throw mapError(error); }
}

async function callAction(client: SupabaseClient<Database>, name: string, args: Record<string, unknown>) {
  const { data, error } = await (client as unknown as AuthenticatedRpcClient).rpc(name, args);
  if (error) throw mapError(error);
  return data;
}

export function requestPackageApproval(client: SupabaseClient<Database>, packageId: string) {
  return callAction(client, "request_content_package_approval", { target_package_id: packageId });
}
export function decidePackageApproval(client: SupabaseClient<Database>, approvalId: string, decision: "approved" | "rejected", note?: string | null) {
  return callAction(client, "decide_content_package_approval", { target_approval_id: approvalId, approval_decision: decision, approval_note: note ?? null });
}
export function createNextPackageVersion(client: SupabaseClient<Database>, packageId: string, idempotencyKey: string) {
  return callAction(client, "create_next_content_package_version", { target_package_id: packageId, request_idempotency_key: idempotencyKey });
}
export async function approveIdeaForPackage(client: SupabaseClient<Database>, ideaId: string) {
  const rpcClient = client as unknown as AuthenticatedRpcClient;
  const approve = () => rpcClient.rpc("transition_idea_state", { target_idea_id: ideaId, target_state: "approved", transition_note: "Approved for content package generation." });
  const first = await approve();
  if (!first.error) return first.data;
  if (!first.error.message?.includes("invalid_idea_transition")) throw mapError(first.error);
  const shortlisted = await rpcClient.rpc("transition_idea_state", { target_idea_id: ideaId, target_state: "shortlisted", transition_note: "Shortlisted for content package review." });
  if (shortlisted.error) throw mapError(shortlisted.error);
  const approved = await approve();
  if (approved.error) throw mapError(approved.error);
  return approved.data;
}
