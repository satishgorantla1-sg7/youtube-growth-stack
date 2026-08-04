import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadUsagePage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Usage · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const session = await getWorkspacePageSession("/usage");
  const state = session.source && session.workspaceId ? await loadUsagePage(session.source, session.workspaceId) : { kind: "empty", data: { entries: [], totalCredits: 0 } } as const;
  return <WorkspaceShell activePath="/usage" title="Usage" description="Recent provider usage recorded in your workspace ledger." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Demo activity does not create billable usage ledger entries.</p></PageStateNotice> : null}
    {state.kind === "error" ? <PageStateNotice title="Usage is unavailable" tone="error"><p>We could not load the workspace ledger. Try again shortly.</p></PageStateNotice> : null}
    {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No recorded usage"><p>No provider credits have been recorded for this workspace.</p></PageStateNotice> : null}
    {state.kind === "ready" ? <><PageStateNotice title={`${state.data.totalCredits} recent credits`}><p>This total covers the latest {state.data.entries.length} ledger entries shown below, not a billing statement.</p></PageStateNotice><RecordList>{state.data.entries.map((item) => <RecordCard key={item.id} title={`${item.provider} · ${item.operation}`} meta={`${item.credits} credits`}><p>Recorded {formatDate(item.created_at)}</p>{item.provider_cost_usd === null ? null : <p>Provider cost recorded: ${item.provider_cost_usd.toFixed(4)}</p>}</RecordCard>)}</RecordList></> : null}
  </WorkspaceShell>;
}
