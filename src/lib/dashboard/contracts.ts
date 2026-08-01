import type { Database } from "@/lib/supabase/database.types";

export type ChannelRow = Pick<Database["public"]["Tables"]["channels"]["Row"], "id" | "title" | "handle" | "connection_state" | "last_synced_at">;
export type ProjectRow = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name" | "niche" | "status" | "created_at">;
export type ResearchRunRow = Pick<Database["public"]["Tables"]["research_runs"]["Row"], "id" | "prompt" | "mode" | "state" | "estimated_credits" | "actual_credits" | "created_at" | "completed_at" | "error_code">;
export type ResearchSourceRow = Pick<Database["public"]["Tables"]["research_sources"]["Row"], "id" | "research_run_id">;
export type IdeaRow = Pick<Database["public"]["Tables"]["ideas"]["Row"], "id" | "title" | "premise" | "score" | "status" | "created_at">;
export type PackageRow = Pick<Database["public"]["Tables"]["content_packages"]["Row"], "id" | "idea_id" | "version" | "state" | "created_at" | "updated_at">;
export type ApprovalRow = Pick<Database["public"]["Tables"]["approvals"]["Row"], "id" | "entity_type" | "state" | "risk_summary" | "estimated_credits" | "requested_at" | "decided_at">;
export type UsageRow = Pick<Database["public"]["Tables"]["usage_ledger"]["Row"], "id" | "provider" | "operation" | "credits" | "provider_cost_usd" | "created_at">;
export type WorkspaceRow = Pick<Database["public"]["Tables"]["workspaces"]["Row"], "id" | "name" | "slug" | "plan" | "daily_credit_limit">;

export type DataResult<T> = { data: T; error: null } | { data: null; error: string };

export function isDataError<T>(value: DataResult<T>): value is { data: null; error: string } {
  return value.data === null;
}

export type PageState<T> =
  | { kind: "ready"; data: T }
  | { kind: "empty"; data: T }
  | { kind: "error"; message: string };

export type ResearchListItem = ResearchRunRow & { sourceCount: number };
export type PackageListItem = PackageRow & { ideaTitle: string | null };

export type WorkspacePageContext = {
  workspaceId: string | null;
  workspaceName: string;
  displayName: string;
  role: string;
  mode: "demo" | "connected";
  navigationCounts?: { research: number; ideas: number; packages: number; approvals: number };
};

export interface DashboardDataSource {
  researchRuns(workspaceId: string): Promise<DataResult<ResearchRunRow[]>>;
  researchSources(workspaceId: string, runIds: string[]): Promise<DataResult<ResearchSourceRow[]>>;
  ideas(workspaceId: string): Promise<DataResult<IdeaRow[]>>;
  packages(workspaceId: string): Promise<DataResult<PackageRow[]>>;
  ideasById(workspaceId: string, ideaIds: string[]): Promise<DataResult<Pick<IdeaRow, "id" | "title">[]>>;
  approvals(workspaceId: string): Promise<DataResult<ApprovalRow[]>>;
  channels(workspaceId: string): Promise<DataResult<ChannelRow[]>>;
  projects(workspaceId: string): Promise<DataResult<ProjectRow[]>>;
  usage(workspaceId: string): Promise<DataResult<UsageRow[]>>;
  workspace(workspaceId: string): Promise<DataResult<WorkspaceRow>>;
  navigationCounts(workspaceId: string): Promise<DataResult<{ research: number; ideas: number; packages: number; approvals: number }>>;
}
