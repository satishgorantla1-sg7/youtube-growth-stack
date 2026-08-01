import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ApprovalRow,
  ChannelRow,
  DashboardDataSource,
  DataResult,
  IdeaRow,
  PackageRow,
  ProjectRow,
  ResearchRunRow,
  ResearchSourceRow,
  UsageRow,
  WorkspaceRow,
} from "./contracts";

function result<T>(data: T | null, error: { message: string } | null): DataResult<T> {
  return error || data === null ? { data: null, error: error?.message ?? "The database returned no data." } : { data, error: null };
}

export class SupabaseDashboardDataSource implements DashboardDataSource {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async researchRuns(workspaceId: string) {
    const { data, error } = await this.client.from("research_runs")
      .select("id,prompt,mode,state,estimated_credits,actual_credits,created_at,completed_at,error_code")
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
    return result(data as ResearchRunRow[] | null, error);
  }

  async researchSources(workspaceId: string, runIds: string[]) {
    if (runIds.length === 0) return { data: [] as ResearchSourceRow[], error: null };
    const { data, error } = await this.client.from("research_sources")
      .select("id,research_run_id").eq("workspace_id", workspaceId).in("research_run_id", runIds);
    return result(data as ResearchSourceRow[] | null, error);
  }

  async ideas(workspaceId: string) {
    const { data, error } = await this.client.from("ideas")
      .select("id,title,premise,score,status,created_at").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(50);
    return result(data as IdeaRow[] | null, error);
  }

  async packages(workspaceId: string) {
    const { data, error } = await this.client.from("content_packages")
      .select("id,idea_id,version,state,created_at,updated_at").eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false }).limit(50);
    return result(data as PackageRow[] | null, error);
  }

  async ideasById(workspaceId: string, ideaIds: string[]) {
    if (ideaIds.length === 0) return { data: [] as Pick<IdeaRow, 'id' | 'title'>[], error: null };
    const { data, error } = await this.client.from("ideas")
      .select("id,title").eq("workspace_id", workspaceId).in("id", ideaIds);
    return result(data as Pick<IdeaRow, "id" | "title">[] | null, error);
  }

  async approvals(workspaceId: string) {
    const { data, error } = await this.client.from("approvals")
      .select("id,entity_type,state,risk_summary,estimated_credits,requested_at,decided_at")
      .eq("workspace_id", workspaceId).order("requested_at", { ascending: false }).limit(50);
    return result(data as ApprovalRow[] | null, error);
  }

  async channels(workspaceId: string) {
    const { data, error } = await this.client.from("channels")
      .select("id,title,handle,connection_state,last_synced_at").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(20);
    return result(data as ChannelRow[] | null, error);
  }

  async projects(workspaceId: string) {
    const { data, error } = await this.client.from("projects")
      .select("id,name,niche,status,created_at").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(50);
    return result(data as ProjectRow[] | null, error);
  }

  async usage(workspaceId: string) {
    const { data, error } = await this.client.from("usage_ledger")
      .select("id,provider,operation,credits,provider_cost_usd,created_at").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(100);
    return result(data as UsageRow[] | null, error);
  }

  async workspace(workspaceId: string) {
    const { data, error } = await this.client.from("workspaces")
      .select("id,name,slug,plan,daily_credit_limit").eq("id", workspaceId).single();
    return result(data as WorkspaceRow | null, error);
  }

  async navigationCounts(workspaceId: string) {
    const [ideas, packages, approvals] = await Promise.all([
      this.client.from("ideas").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      this.client.from("content_packages").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      this.client.from("approvals").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("state", "pending"),
    ]);
    const firstError = ideas.error ?? packages.error ?? approvals.error;
    if (firstError) return { data: null, error: firstError.message } as const;
    return { data: { ideas: ideas.count ?? 0, packages: packages.count ?? 0, approvals: approvals.count ?? 0 }, error: null } as const;
  }
}
