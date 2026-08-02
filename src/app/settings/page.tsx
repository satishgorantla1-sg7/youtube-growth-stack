import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadSettingsPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";

export const metadata = { title: "Settings · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getWorkspacePageSession("/settings");
  const state = session.source && session.workspaceId ? await loadSettingsPage(session.source, session.workspaceId) : null;
  return <WorkspaceShell activePath="/settings" title="Settings" description="Workspace preferences and provider connections." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo settings"><p>Connect Supabase to load a real workspace configuration.</p></PageStateNotice> : null}
    {state?.kind === "error" ? <PageStateNotice title="Settings are unavailable" tone="error"><p>We could not load workspace settings. Try again shortly.</p></PageStateNotice> : null}
    {state?.kind === "ready" ? <><RecordCard title={state.data.workspace.name} meta={state.data.workspace.plan}><p>Workspace URL: /{state.data.workspace.slug}</p><p>Daily credit limit: {state.data.workspace.daily_credit_limit}</p><p>Your role: {session.role}</p></RecordCard><section className="panel settings-provider-card"><div><p className="youtube-eyebrow">Provider connection</p><h2>YouTube</h2><p>{state.data.channels.length === 0 ? "No channel connected." : `${state.data.channels.length} channel connection${state.data.channels.length === 1 ? "" : "s"} recorded.`}</p></div><Link href="/settings/youtube">Manage YouTube connection</Link></section>{state.data.channels.length > 0 ? <RecordList>{state.data.channels.map((channel) => <RecordCard key={channel.id} title={channel.title} meta={channel.connection_state}><p>Last synchronized {formatDate(channel.last_synced_at)}</p></RecordCard>)}</RecordList> : null}</> : null}
  </WorkspaceShell>;
}
