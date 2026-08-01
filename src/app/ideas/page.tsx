import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadIdeasPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Ideas · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const session = await getWorkspacePageSession("/ideas");
  const state = session.source && session.workspaceId ? await loadIdeasPage(session.source, session.workspaceId) : { kind: "empty", data: [] } as const;
  return <WorkspaceShell activePath="/ideas" title="Idea Library" description="Evidence-grounded ideas saved for this workspace." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Connect Supabase to view saved ideas. No sample ideas are presented as customer data.</p></PageStateNotice> : null}
    {state.kind === "error" ? <PageStateNotice title="Ideas are unavailable" tone="error"><p>We could not load this workspace’s ideas. Try again shortly.</p></PageStateNotice> : null}
    {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No ideas yet"><p>Ideas generated from completed research will appear here in a later delivery slice.</p></PageStateNotice> : null}
    {state.kind === "ready" ? <RecordList>{state.data.map((idea) => <RecordCard key={idea.id} title={idea.title} meta={idea.status}><p>{idea.premise}</p><p>{idea.score === null ? "Not scored" : `Internal score ${idea.score}`} · Created {formatDate(idea.created_at)}</p></RecordCard>)}</RecordList> : null}
  </WorkspaceShell>;
}
