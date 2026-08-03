import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { DemoIdeaGenerationProvider } from "./demo-provider";
import { generateEvidenceGroundedIdeas, type GeneratedIdea } from "./generation";
import { beginIdeaGeneration, SupabaseIdeaGenerationRepository, type IdeaRpcClient } from "./repository";

export const ideaGenerationInputSchema = z.object({
  researchRunId: z.string().uuid(), evidenceSourceIds: z.array(z.string().uuid()).min(1).max(10),
  maxIdeas: z.number().int().min(1).max(3), idempotencyKey: z.string().min(8).max(128),
}).strict().refine((value) => new Set(value.evidenceSourceIds).size === value.evidenceSourceIds.length, { message: "Evidence sources must be unique", path: ["evidenceSourceIds"] });
export type IdeaGenerationInput = z.infer<typeof ideaGenerationInputSchema>;

type EvidenceRow = { id: string; title: string | null; content: string | null; url: string; research_run_id: string };
type EvidenceClient = { from(table: "research_sources"): { select(columns: string): { eq(column: string, value: string): { eq(column: string, value: string): { in(column: string, values: string[]): Promise<{ data: EvidenceRow[] | null; error: { message?: string } | null }> } } } } };

export class IdeaGenerationServerError extends Error {
  constructor(readonly code: "idea_generation_unavailable" | "idea_generation_forbidden" | "invalid_evidence" | "completed_research_required" | "idea_generation_conflict" | "generation_failed") { super(code); }
}

function serviceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new IdeaGenerationServerError("idea_generation_unavailable");
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function generateIdeasForUser(authenticatedClient: SupabaseClient<Database>, input: IdeaGenerationInput & { workspaceId: string; userId: string }, createService = serviceClient): Promise<{ generationRunId: string; ideas: GeneratedIdea[]; reused: boolean }> {
  const selected = await (authenticatedClient as unknown as EvidenceClient).from("research_sources").select("id,title,content,url,research_run_id").eq("workspace_id", input.workspaceId).eq("research_run_id", input.researchRunId).in("id", input.evidenceSourceIds);
  if (selected.error) throw new IdeaGenerationServerError("idea_generation_forbidden");
  if (!selected.data || selected.data.length !== input.evidenceSourceIds.length) throw new IdeaGenerationServerError("invalid_evidence");
  const byId = new Map(selected.data.map((item) => [item.id, item]));
  const ordered = input.evidenceSourceIds.map((id) => byId.get(id)).filter((item): item is EvidenceRow => Boolean(item));
  if (ordered.some((item) => item.research_run_id !== input.researchRunId)) throw new IdeaGenerationServerError("invalid_evidence");
  try {
    const service = createService();
    const rpc = service as unknown as IdeaRpcClient;
    const run = await beginIdeaGeneration(rpc, {
      workspaceId: input.workspaceId, researchRunId: input.researchRunId, requestedBy: input.userId,
      idempotencyKey: input.idempotencyKey, maxIdeas: input.maxIdeas, modelVersion: "evidence-preview-v1", promptVersion: "ideas-v1",
    });
    if (!run.created && run.state === "completed") return { generationRunId: run.id, ideas: [], reused: true };
    const ideas = await generateEvidenceGroundedIdeas(new DemoIdeaGenerationProvider(), new SupabaseIdeaGenerationRepository(rpc), {
      generationRunId: run.id, workspaceId: input.workspaceId, researchRunId: input.researchRunId,
      maxIdeas: input.maxIdeas, evidence: ordered.map(({ id, title, content, url }) => ({ id, title, content, url })),
    });
    return { generationRunId: run.id, ideas, reused: false };
  } catch (error) {
    const code = error instanceof Error ? error.message : "generation_failed";
    if (["completed_research_required", "idea_generation_conflict", "idea_generation_forbidden"].includes(code)) throw new IdeaGenerationServerError(code as "completed_research_required" | "idea_generation_conflict" | "idea_generation_forbidden");
    if (error instanceof IdeaGenerationServerError) throw error;
    throw new IdeaGenerationServerError("generation_failed");
  }
}
