import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadPerformancePage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Performance · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const session = await getWorkspacePageSession("/performance");
  const state = session.source && session.workspaceId ? await loadPerformancePage(session.source, session.workspaceId) : { kind: "empty", data: [] } as const;
  return <WorkspaceShell activePath="/performance" title="Performance" description="Channel analytics will be based on bounded, read-only YouTube snapshots." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    <PageStateNotice title="Analytics not available yet" tone="info"><p>This screen remains empty until a real YouTube channel is connected and snapshot ingestion is delivered. We will not present sample metrics as your performance.</p></PageStateNotice>
    {state.kind === "error" ? <PageStateNotice title="Channel status is unavailable" tone="error"><p>We could not load channel connection records. Try again shortly.</p></PageStateNotice> : null}
    {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No connected channel"><p>A read-only YouTube connection will be added in a later delivery slice.</p></PageStateNotice> : null}
    {state.kind === "ready" ? <RecordList>{state.data.map((channel) => <RecordCard key={channel.id} title={channel.title} meta={channel.connection_state}><p>{channel.handle ?? "No handle recorded"}</p><p>Last synchronized {formatDate(channel.last_synced_at)}</p></RecordCard>)}</RecordList> : null}
  </WorkspaceShell>;
}
