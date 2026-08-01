import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadResearchPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Research · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const session = await getWorkspacePageSession("/research");
  const state = session.source && session.workspaceId
    ? await loadResearchPage(session.source, session.workspaceId)
    : { kind: "empty", data: [] } as const;
  return (
    <WorkspaceShell activePath="/research" title="Research" description="Your workspace research runs and saved evidence." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
      {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Connect Supabase to view tenant research history. Demo mode does not invent research records.</p></PageStateNotice> : null}
      {state.kind === "error" ? <PageStateNotice title="Research is unavailable" tone="error"><p>We could not load this workspace’s research. Try again shortly.</p></PageStateNotice> : null}
      {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No research yet"><p>Ask the growth agent to plan research. Paid research will still require your explicit approval.</p></PageStateNotice> : null}
      {state.kind === "ready" ? <RecordList>{state.data.map((run) => <RecordCard key={run.id} title={run.prompt} meta={run.state}><p>{run.mode} research · {run.sourceCount} evidence source{run.sourceCount === 1 ? "" : "s"}</p><p>Created {formatDate(run.created_at)} · Credits {run.actual_credits ?? run.estimated_credits}</p>{run.error_code ? <p>Failure code: {run.error_code}</p> : null}</RecordCard>)}</RecordList> : null}
    </WorkspaceShell>
  );
}
