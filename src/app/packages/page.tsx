import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadPackagesPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Packages · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const session = await getWorkspacePageSession("/packages");
  const state = session.source && session.workspaceId ? await loadPackagesPage(session.source, session.workspaceId) : { kind: "empty", data: [] } as const;
  return <WorkspaceShell activePath="/packages" title="Content Packages" description="Versioned content packages belonging to this workspace." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Connect Supabase to view saved packages. Demo mode does not invent package history.</p></PageStateNotice> : null}
    {state.kind === "error" ? <PageStateNotice title="Packages are unavailable" tone="error"><p>We could not load this workspace’s packages. Try again shortly.</p></PageStateNotice> : null}
    {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No content packages yet"><p>Packages will appear here after an approved idea is developed in a later delivery slice.</p></PageStateNotice> : null}
    {state.kind === "ready" ? <RecordList>{state.data.map((item) => <RecordCard key={item.id} title={item.ideaTitle ?? "Untitled idea"} meta={item.state}><p>Version {item.version}</p><p>Updated {formatDate(item.updated_at)}</p></RecordCard>)}</RecordList> : null}
  </WorkspaceShell>;
}
