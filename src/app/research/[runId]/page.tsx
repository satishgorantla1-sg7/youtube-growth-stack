import { notFound } from "next/navigation";
import { z } from "zod";
import { PageStateNotice } from "@/app/_components/workspace-page";
import { ResearchDetail } from "@/components/research/research-explorer";
import { WorkspaceShell } from "@/components/workspace";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { SupabaseResearchExplorerSource } from "@/lib/research/explorer";
import { createClient } from "@/lib/supabase/server";
import "../research.css";

export const metadata = { title: "Research evidence · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function ResearchDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!z.string().uuid().safeParse(runId).success) notFound();
  const session = await getWorkspacePageSession(`/research/${runId}`);
  let run = null; let loadFailed = false;
  if (session.mode === "connected" && session.workspaceId) {
    try { run = await new SupabaseResearchExplorerSource(await createClient()).detail(session.workspaceId, runId); }
    catch { loadFailed = true; }
    if (!loadFailed && !run) notFound();
  }
  return <WorkspaceShell activePath="/research" title="Research evidence" description="A tenant-scoped run and its saved source provenance." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Research configuration required" tone="info"><p>Connect Supabase and sign in to inspect workspace evidence.</p></PageStateNotice> : null}
    {loadFailed ? <PageStateNotice title="Research run is unavailable" tone="error"><p>We could not load this run. Try again shortly.</p></PageStateNotice> : null}
    {run ? <ResearchDetail run={run} canManage={session.role === "owner" || session.role === "admin"} /> : null}
  </WorkspaceShell>;
}
