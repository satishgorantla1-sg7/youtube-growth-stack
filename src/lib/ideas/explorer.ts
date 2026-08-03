import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";
import { boundedPreview, safeEvidenceUrl } from "@/lib/research/explorer";

export type IdeaEvidenceOption = { id: string; title: string; url: string; preview: string | null };
export type IdeaRunOption = { id: string; prompt: string; completedAt: string; evidence: IdeaEvidenceOption[] };
export type IdeaResult = {
  id: string; title: string; premise: string; status: string; score: number;
  demandScore: number; relevanceScore: number; competitionScore: number; confidenceScore: number;
  scoringReason: Json; createdAt: string; modelVersion: string; evidence: IdeaEvidenceOption[];
};
export type IdeasWorkspace = { runs: IdeaRunOption[]; ideas: IdeaResult[] };

type QueryResult = { data: unknown; error: { message?: string } | null };
interface DynamicQuery extends PromiseLike<QueryResult> {
  select(columns: string): DynamicQuery;
  eq(column: string, value: unknown): DynamicQuery;
  not(column: string, operator: string, value: unknown): DynamicQuery;
  in(column: string, values: readonly string[]): DynamicQuery;
  order(column: string, options: { ascending: boolean }): DynamicQuery;
  limit(count: number): DynamicQuery;
}
type DynamicClient = { from(table: string): DynamicQuery };

const runRow = z.object({ id: z.string().uuid(), prompt: z.string(), completed_at: z.string() });
const sourceRow = z.object({ id: z.string().uuid(), research_run_id: z.string().uuid(), title: z.string().nullable(), url: z.string(), content: z.string().nullable() });
const ideaRow = z.object({
  id: z.string().uuid(), title: z.string(), premise: z.string(), status: z.string(), score: z.coerce.number(),
  demand_score: z.coerce.number(), relevance_score: z.coerce.number(), competition_score: z.coerce.number(), confidence_score: z.coerce.number(),
  scoring_reason: z.unknown(), created_at: z.string(), model_version: z.string(),
});
const citationRow = z.object({ idea_id: z.string().uuid(), research_source_id: z.string().uuid() });

function db(client: SupabaseClient<Database>) { return client as unknown as DynamicClient; }
function evidence(row: z.infer<typeof sourceRow>): IdeaEvidenceOption {
  return { id: row.id, title: row.title ?? "Untitled source", url: safeEvidenceUrl(row.url) ?? "", preview: boundedPreview(row.content) };
}

export async function loadIdeasWorkspace(client: SupabaseClient<Database>, workspaceId: string): Promise<IdeasWorkspace> {
  const database = db(client);
  const [{ data: rawRuns, error: runError }, { data: rawIdeas, error: ideaError }] = await Promise.all([
    database.from("research_runs").select("id,prompt,completed_at").eq("workspace_id", workspaceId).eq("state", "completed").order("completed_at", { ascending: false }).limit(20),
    database.from("ideas").select("id,title,premise,status,score,demand_score,relevance_score,competition_score,confidence_score,scoring_reason,created_at,model_version").eq("workspace_id", workspaceId).not("generation_run_id", "is", null).order("created_at", { ascending: false }).limit(50),
  ]);
  if (runError || ideaError) throw new Error("ideas_workspace_unavailable");
  const runs = z.array(runRow).parse(rawRuns ?? []);
  const ideas = z.array(ideaRow).parse(rawIdeas ?? []);
  const runIds = runs.map(({ id }) => id);
  const ideaIds = ideas.map(({ id }) => id);
  const [sourceResult, citationResult] = await Promise.all([
    runIds.length ? database.from("research_sources").select("id,research_run_id,title,url,content").eq("workspace_id", workspaceId).in("research_run_id", runIds).order("captured_at", { ascending: true }).limit(250) : Promise.resolve({ data: [], error: null }),
    ideaIds.length ? database.from("idea_evidence").select("idea_id,research_source_id").eq("workspace_id", workspaceId).in("idea_id", ideaIds).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  if (sourceResult.error || citationResult.error) throw new Error("ideas_workspace_unavailable");
  const sources = z.array(sourceRow).parse(sourceResult.data ?? []);
  const citations = z.array(citationRow).parse(citationResult.data ?? []);
  const sourceById = new Map(sources.map((row) => [row.id, evidence(row)]));
  return {
    runs: runs.map((run) => ({ id: run.id, prompt: run.prompt, completedAt: run.completed_at, evidence: sources.filter((source) => source.research_run_id === run.id).map(evidence) })).filter((run) => run.evidence.length > 0),
    ideas: ideas.map((idea) => ({
      id: idea.id, title: idea.title, premise: idea.premise, status: idea.status, score: idea.score,
      demandScore: idea.demand_score, relevanceScore: idea.relevance_score, competitionScore: idea.competition_score, confidenceScore: idea.confidence_score,
      scoringReason: idea.scoring_reason as Json, createdAt: idea.created_at, modelVersion: idea.model_version,
      evidence: citations.filter((item) => item.idea_id === idea.id).map((item) => sourceById.get(item.research_source_id)).filter((item): item is IdeaEvidenceOption => Boolean(item)),
    })),
  };
}
