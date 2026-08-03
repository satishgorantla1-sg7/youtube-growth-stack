import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";

export const RESEARCH_PAGE_SIZE = 12;
export const RESEARCH_EVIDENCE_LIMIT = 50;
export const RESEARCH_PREVIEW_LIMIT = 280;

const runStates = ["all", "queued", "running", "completed", "failed", "cancelled", "dead_letter", "configuration_required"] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type ResearchDisplayState = Exclude<(typeof runStates)[number], "all">;
export type ResearchFilters = { page: number; state: (typeof runStates)[number]; projectId: string | null; from: string | null; to: string | null };
export type ResearchProjectOption = { id: string; name: string };
export type ResearchHistoryItem = {
  id: string; projectId: string | null; projectName: string | null; prompt: string; mode: string;
  state: ResearchDisplayState; sourceCount: number; estimatedCredits: number; actualCredits: number | null;
  createdAt: string; completedAt: string | null; errorCode: string | null;
};
export type ResearchEvidence = {
  id: string; provider: string; sourceType: string; url: string; title: string;
  capturedAt: string; provenance: Json; preview: string | null;
};
export type ResearchRunDetail = ResearchHistoryItem & { startedAt: string | null; updatedAt: string; evidence: ResearchEvidence[]; evidenceLimited: boolean };

type RunRow = Database["public"]["Tables"]["research_runs"]["Row"];
type SourceRow = Database["public"]["Tables"]["research_sources"]["Row"];

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
export function parseResearchFilters(input: Record<string, string | string[] | undefined>): ResearchFilters {
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse(single(input.page));
  const state = z.enum(runStates).catch("all").parse(single(input.state));
  const project = single(input.project);
  const projectId = project && z.string().uuid().safeParse(project).success ? project : null;
  const fromValue = single(input.from); const toValue = single(input.to);
  return { page, state, projectId, from: fromValue && datePattern.test(fromValue) ? fromValue : null, to: toValue && datePattern.test(toValue) ? toValue : null };
}

export function displayResearchState(state: string, errorCode: string | null): ResearchDisplayState {
  if (errorCode?.includes("configuration") || errorCode?.includes("not_configured")) return "configuration_required";
  if (state === "dead_letter" || errorCode?.includes("dead_letter") || errorCode === "lease_expired_at_max_attempts") return "dead_letter";
  if (state === "leased") return "running";
  if (["queued", "running", "completed", "failed", "cancelled"].includes(state)) return state as ResearchDisplayState;
  return state === "cancelling" ? "running" : "queued";
}

export function boundedPreview(content: string | null): string | null {
  if (!content) return null;
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > RESEARCH_PREVIEW_LIMIT ? `${normalized.slice(0, RESEARCH_PREVIEW_LIMIT).trimEnd()}…` : normalized;
}

export function safeEvidenceUrl(value: string): string | null {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
  catch { return null; }
}

export type ResearchHistoryResult = { items: ResearchHistoryItem[]; projects: ResearchProjectOption[]; page: number; hasPrevious: boolean; hasNext: boolean };
export interface ResearchExplorerSource {
  history(workspaceId: string, filters: ResearchFilters): Promise<ResearchHistoryResult>;
  detail(workspaceId: string, runId: string): Promise<ResearchRunDetail | null>;
}

function mapRun(row: Pick<RunRow, "id" | "project_id" | "prompt" | "mode" | "state" | "estimated_credits" | "actual_credits" | "created_at" | "completed_at" | "error_code">, projectName: string | null, sourceCount: number): ResearchHistoryItem {
  return { id: row.id, projectId: row.project_id, projectName, prompt: row.prompt, mode: row.mode, state: displayResearchState(row.state, row.error_code), sourceCount, estimatedCredits: row.estimated_credits, actualCredits: row.actual_credits, createdAt: row.created_at, completedAt: row.completed_at, errorCode: row.error_code };
}

export class SupabaseResearchExplorerSource implements ResearchExplorerSource {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async history(workspaceId: string, filters: ResearchFilters): Promise<ResearchHistoryResult> {
    const offset = (filters.page - 1) * RESEARCH_PAGE_SIZE;
    let query = this.client.from("research_runs")
      .select("id,project_id,prompt,mode,state,estimated_credits,actual_credits,created_at,completed_at,error_code")
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + RESEARCH_PAGE_SIZE);
    if (filters.projectId) query = query.eq("project_id", filters.projectId);
    if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
    if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
    if (filters.state === "running") query = query.in("state", ["running", "leased", "cancelling"]);
    else if (["queued", "completed", "failed", "cancelled"].includes(filters.state)) query = query.eq("state", filters.state);
    if (filters.state === "dead_letter") query = query.or("state.eq.dead_letter,error_code.ilike.%dead_letter%,error_code.eq.lease_expired_at_max_attempts");
    if (filters.state === "configuration_required") query = query.or("error_code.ilike.%configuration%,error_code.ilike.%not_configured%");

    const [{ data: rows, error }, { data: projects, error: projectError }] = await Promise.all([
      query,
      this.client.from("projects").select("id,name").eq("workspace_id", workspaceId).order("name", { ascending: true }).limit(200),
    ]);
    if (error || projectError) throw new Error("research_history_unavailable");
    const visibleRows = ((rows ?? []) as RunRow[]).slice(0, RESEARCH_PAGE_SIZE);
    const ids = visibleRows.map((row) => row.id);
    const sourceCounts = new Map<string, number>();
    if (ids.length) {
      const { data: sources, error: sourceError } = await this.client.from("research_sources").select("research_run_id").eq("workspace_id", workspaceId).in("research_run_id", ids);
      if (sourceError) throw new Error("research_history_unavailable");
      for (const source of sources ?? []) sourceCounts.set(source.research_run_id, (sourceCounts.get(source.research_run_id) ?? 0) + 1);
    }
    const projectOptions = (projects ?? []) as ResearchProjectOption[];
    const names = new Map(projectOptions.map((project) => [project.id, project.name]));
    return { items: visibleRows.map((row) => mapRun(row, row.project_id ? names.get(row.project_id) ?? null : null, sourceCounts.get(row.id) ?? 0)), projects: projectOptions, page: filters.page, hasPrevious: filters.page > 1, hasNext: (rows ?? []).length > RESEARCH_PAGE_SIZE };
  }

  async detail(workspaceId: string, runId: string): Promise<ResearchRunDetail | null> {
    const { data: run, error } = await this.client.from("research_runs")
      .select("id,project_id,prompt,mode,state,estimated_credits,actual_credits,created_at,started_at,updated_at,completed_at,error_code")
      .eq("workspace_id", workspaceId).eq("id", runId).maybeSingle();
    if (error) throw new Error("research_detail_unavailable");
    if (!run) return null;
    const [{ data: sources, error: sourceError }, projectResult] = await Promise.all([
      this.client.from("research_sources").select("id,provider,source_type,url,title,content,provenance,captured_at").eq("workspace_id", workspaceId).eq("research_run_id", runId).order("captured_at", { ascending: true }).limit(RESEARCH_EVIDENCE_LIMIT + 1),
      run.project_id ? this.client.from("projects").select("name").eq("workspace_id", workspaceId).eq("id", run.project_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (sourceError || projectResult.error) throw new Error("research_detail_unavailable");
    const evidenceRows = (sources ?? []) as SourceRow[];
    const base = mapRun(run, projectResult.data?.name ?? null, evidenceRows.length);
    return { ...base, startedAt: run.started_at, updatedAt: run.updated_at, evidenceLimited: evidenceRows.length > RESEARCH_EVIDENCE_LIMIT, evidence: evidenceRows.slice(0, RESEARCH_EVIDENCE_LIMIT).map((source) => ({ id: source.id, provider: source.provider, sourceType: source.source_type, url: source.url, title: source.title ?? "Untitled source", capturedAt: source.captured_at, provenance: source.provenance, preview: boundedPreview(source.content) })) };
  }
}
