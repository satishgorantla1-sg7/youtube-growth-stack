import { WorkspaceShell } from "@/components/workspace";
import { z } from "zod";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadApprovalsPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Approvals · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ research_retry?: string; approval?: string }> }) {
  const session = await getWorkspacePageSession("/approvals");
  const params = await searchParams;
  const state = session.source && session.workspaceId ? await loadApprovalsPage(session.source, session.workspaceId) : { kind: "empty", data: [] } as const;
  const approvalId = z.string().uuid().safeParse(params.approval);
  const retryPending = params.research_retry === "pending" && approvalId.success && state.kind === "ready" && state.data.some((approval) => approval.id === approvalId.data && approval.state === "pending");
  return <WorkspaceShell activePath="/approvals" title="Approvals" description="Auditable decisions for paid, publishing, credential, and destructive actions." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {retryPending ? <PageStateNotice title="Retry approval created" tone="info"><p>The retry is pending review. Research has not been queued, credits have not been reserved, and no provider has been called.</p></PageStateNotice> : null}
    {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Connect Supabase to view your append-only approval history.</p></PageStateNotice> : null}
    {state.kind === "error" ? <PageStateNotice title="Approvals are unavailable" tone="error"><p>We could not load this workspace’s approvals. Try again shortly.</p></PageStateNotice> : null}
    {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No approval requests"><p>Approval requests appear here before guarded actions can proceed.</p></PageStateNotice> : null}
    {state.kind === "ready" ? <RecordList>{state.data.map((item) => <RecordCard key={item.id} title={item.entity_type.replaceAll("_", " ")} meta={item.state}><p>{item.risk_summary}</p><p>Estimated credits {item.estimated_credits} · Requested {formatDate(item.requested_at)}</p></RecordCard>)}</RecordList> : null}
  </WorkspaceShell>;
}
