import { PageStateNotice } from "@/app/_components/workspace-page";
import { WorkspaceShell } from "@/components/workspace";
import { ResearchHistory } from "@/components/research/research-explorer";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { parseResearchFilters, SupabaseResearchExplorerSource } from "@/lib/research/explorer";
import { createClient } from "@/lib/supabase/server";
import "./research.css";

export const metadata = { title: "Research · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getWorkspacePageSession("/research");
  const filters = parseResearchFilters(await searchParams);
  let result = null; let loadFailed = false;
  if (session.mode === "connected" && session.workspaceId) {
    try { result = await new SupabaseResearchExplorerSource(await createClient()).history(session.workspaceId, filters); }
    catch { loadFailed = true; }
  }
  return <WorkspaceShell activePath="/research" title="Research" description="Workspace research history and saved source evidence." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Research configuration required" tone="info"><p>Connect Supabase to view tenant research history. Demo mode never invents research records.</p></PageStateNotice> : null}
    {loadFailed ? <PageStateNotice title="Research is unavailable" tone="error"><p>We could not load this workspace’s research. No records from another workspace are shown. Try again shortly.</p></PageStateNotice> : null}
    {result ? <ResearchHistory result={result} filters={filters} /> : null}
  </WorkspaceShell>;
}
