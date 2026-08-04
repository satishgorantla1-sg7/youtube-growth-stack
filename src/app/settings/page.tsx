import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadSettingsPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Settings · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getWorkspacePageSession("/settings");
  const state = session.source && session.workspaceId ? await loadSettingsPage(session.source, session.workspaceId) : null;
  return <WorkspaceShell activePath="/settings" title="Settings" description="Read-only workspace and connection settings." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo settings"><p>Connect Supabase to load a real workspace configuration.</p></PageStateNotice> : null}
    {state?.kind === "error" ? <PageStateNotice title="Settings are unavailable" tone="error"><p>We could not load workspace settings. Try again shortly.</p></PageStateNotice> : null}
    {state?.kind === "ready" ? <><RecordCard title={state.data.workspace.name} meta={state.data.workspace.plan}><p>Workspace URL: /{state.data.workspace.slug}</p><p>Daily credit limit: {state.data.workspace.daily_credit_limit}</p><p>Your role: {session.role}</p></RecordCard>{state.data.channels.length === 0 ? <PageStateNotice title="No provider connections"><p>YouTube connection controls will be delivered with the secure read-only OAuth slice.</p></PageStateNotice> : <RecordList>{state.data.channels.map((channel) => <RecordCard key={channel.id} title={channel.title} meta={channel.connection_state}><p>Last synchronized {formatDate(channel.last_synced_at)}</p></RecordCard>)}</RecordList>}<PageStateNotice title="Editing is not enabled yet" tone="info"><p>Workspace and connection mutation controls are intentionally unavailable until their authorization and audit workflows are implemented.</p></PageStateNotice></> : null}
  </WorkspaceShell>;
}
