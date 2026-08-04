import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";
import { boundedPreview, safeEvidenceUrl } from "@/lib/research/explorer";

export type PackageIdeaOption = { id: string; title: string; premise: string; status: string; evidenceCount: number };
export type PackageEvidenceView = { id: string; title: string; url: string; preview: string | null };
export type PackageVersionView = {
  id: string; ideaId: string; ideaTitle: string; version: number; state: string; sourcePackageId: string | null;
  titles: string[]; thumbnailConcepts: Json; hooks: string[]; outline: Json; script: string;
  evidence: PackageEvidenceView[]; modelVersion: string; promptVersion: string; createdAt: string; updatedAt: string;
  pendingApprovalId: string | null;
};
export type PackagesWorkspace = { approvedIdeas: PackageIdeaOption[]; reviewIdeas: PackageIdeaOption[]; packages: PackageVersionView[] };

type QueryResult = { data: unknown; error: { message?: string } | null };
interface DynamicQuery extends PromiseLike<QueryResult> {
  select(columns: string): DynamicQuery;
  eq(column: string, value: unknown): DynamicQuery;
  in(column: string, values: readonly string[]): DynamicQuery;
  order(column: string, options: { ascending: boolean }): DynamicQuery;
  limit(count: number): DynamicQuery;
}
type DynamicClient = { from(table: string): DynamicQuery };
const ideaRow = z.object({ id: z.string().uuid(), title: z.string(), premise: z.string(), status: z.string() });
const packageRow = z.object({
  id: z.string().uuid(), idea_id: z.string().uuid(), version: z.coerce.number().int().positive(), state: z.string(),
  source_package_id: z.string().uuid().nullable(), titles: z.array(z.string()), thumbnail_concepts: z.unknown(),
  hooks: z.array(z.string()), outline: z.unknown(), script: z.string().nullable(), model_version: z.string().nullable(),
  prompt_version: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const linkRow = z.object({ content_package_id: z.string().uuid(), research_source_id: z.string().uuid() });
const ideaLinkRow = z.object({ idea_id: z.string().uuid(), research_source_id: z.string().uuid() });
const sourceRow = z.object({ id: z.string().uuid(), title: z.string().nullable(), url: z.string(), content: z.string().nullable() });
const approvalRow = z.object({ id: z.string().uuid(), entity_id: z.string(), state: z.string() });

function db(client: SupabaseClient<Database>) { return client as unknown as DynamicClient; }

export async function loadPackagesWorkspace(client: SupabaseClient<Database>, workspaceId: string): Promise<PackagesWorkspace> {
  const database = db(client);
  const [ideaResult, packageResult] = await Promise.all([
    database.from("ideas").select("id,title,premise,status").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
    database.from("content_packages").select("id,idea_id,version,state,source_package_id,titles,thumbnail_concepts,hooks,outline,script,model_version,prompt_version,created_at,updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(100),
  ]);
  if (ideaResult.error || packageResult.error) throw new Error("packages_workspace_unavailable");
  const ideas = z.array(ideaRow).parse(ideaResult.data ?? []);
  const packages = z.array(packageRow).parse(packageResult.data ?? []);
  const packageIds = packages.map(({ id }) => id);
  const ideaIds = ideas.map(({ id }) => id);
  const [packageLinksResult, ideaLinksResult, approvalResult] = await Promise.all([
    packageIds.length ? database.from("content_package_evidence").select("content_package_id,research_source_id").eq("workspace_id", workspaceId).in("content_package_id", packageIds).limit(1_000) : Promise.resolve({ data: [], error: null }),
    ideaIds.length ? database.from("idea_evidence").select("idea_id,research_source_id").eq("workspace_id", workspaceId).in("idea_id", ideaIds).limit(1_000) : Promise.resolve({ data: [], error: null }),
    packageIds.length ? database.from("approvals").select("id,entity_id,state").eq("workspace_id", workspaceId).eq("entity_type", "content_package").in("entity_id", packageIds).limit(200) : Promise.resolve({ data: [], error: null }),
  ]);
  if (packageLinksResult.error || ideaLinksResult.error || approvalResult.error) throw new Error("packages_workspace_unavailable");
  const packageLinks = z.array(linkRow).parse(packageLinksResult.data ?? []);
  const ideaLinks = z.array(ideaLinkRow).parse(ideaLinksResult.data ?? []);
  const approvals = z.array(approvalRow).parse(approvalResult.data ?? []);
  const sourceIds = [...new Set([...packageLinks, ...ideaLinks].map(({ research_source_id }) => research_source_id))];
  const sourceResult = sourceIds.length ? await database.from("research_sources").select("id,title,url,content").eq("workspace_id", workspaceId).in("id", sourceIds).limit(1_000) : { data: [], error: null };
  if (sourceResult.error) throw new Error("packages_workspace_unavailable");
  const sources = z.array(sourceRow).parse(sourceResult.data ?? []);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const ideaById = new Map(ideas.map((idea) => [idea.id, idea]));
  const evidenceView = (ids: string[]) => ids.map((id) => sourceById.get(id)).filter((source): source is z.infer<typeof sourceRow> => Boolean(source)).map((source) => ({
    id: source.id, title: source.title ?? "Untitled source", url: safeEvidenceUrl(source.url) ?? "", preview: boundedPreview(source.content),
  }));
  const ideaOptions = ideas.map((idea) => ({ ...idea, evidenceCount: ideaLinks.filter((link) => link.idea_id === idea.id).length }));
  return {
    approvedIdeas: ideaOptions.filter((idea) => idea.status === "approved"),
    reviewIdeas: ideaOptions.filter((idea) => ["candidate", "shortlisted"].includes(idea.status)),
    packages: packages.map((item) => ({
      id: item.id, ideaId: item.idea_id, ideaTitle: ideaById.get(item.idea_id)?.title ?? "Approved idea", version: item.version,
      state: item.state, sourcePackageId: item.source_package_id, titles: item.titles, thumbnailConcepts: item.thumbnail_concepts as Json,
      hooks: item.hooks, outline: item.outline as Json, script: item.script ?? "", modelVersion: item.model_version ?? "unknown",
      promptVersion: item.prompt_version ?? "unknown", createdAt: item.created_at, updatedAt: item.updated_at,
      evidence: evidenceView(packageLinks.filter((link) => link.content_package_id === item.id).map((link) => link.research_source_id)),
      pendingApprovalId: approvals.find((approval) => approval.entity_id === item.id && approval.state === "pending")?.id ?? null,
    })),
  };
}
