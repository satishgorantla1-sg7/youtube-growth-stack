import { PageStateNotice } from "@/app/_components/workspace-page";
import { WorkspaceShell } from "@/components/workspace";
import { YouTubeConnectionPanel, type YouTubeChannelSummary, type YouTubeConnectionStatus, type YouTubeOwnedChannelCandidate } from "@/components/youtube/youtube-connection-panel";
import { isDataError } from "@/lib/dashboard/contracts";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { youtubeSyncViewOverride } from "@/lib/youtube/connection-view";
export const metadata = { title: "YouTube connection · YouTube Growth Stack" };
export const dynamic = "force-dynamic";
const outcomes: Record<string, { title: string; body: string; tone?: "error" | "info" }> = {
  connected: { title: "Google authorization completed", body: "The channel connection is being verified from workspace data.", tone: "info" },
  authentication_required: { title: "Sign in required", body: "Sign in again before connecting a YouTube channel.", tone: "error" },
  youtube_not_configured: { title: "YouTube OAuth is not configured", body: "A server administrator must add the Google OAuth credentials.", tone: "error" },
  youtube_consent_declined: { title: "Google consent was not granted", body: "Nothing was connected. You can try again after a new approval.", tone: "error" },
  oauth_state_invalid: { title: "Authorization could not be verified", body: "The connection was not changed. Start again from this page.", tone: "error" },
  oauth_state_expired: { title: "Authorization expired", body: "The connection was not changed. Start again from this page.", tone: "error" },
  oauth_state_replayed: { title: "Authorization already used", body: "This authorization cannot be reused. Start again from this page.", tone: "error" },
  youtube_reconnect_required: { title: "Reconnection required", body: "The previous Google authorization is no longer valid.", tone: "error" },
  youtube_provider_unavailable: { title: "Google is temporarily unavailable", body: "No connection was changed. Try again later.", tone: "error" },
  youtube_provider_rejected_request: { title: "Google rejected the request", body: "No connection was changed. Start again or use a different Google account.", tone: "error" },
  youtube_provider_disabled: { title: "YouTube connection is temporarily disabled", body: "No Google authorization or channel read was started. Try again after an administrator enables the provider.", tone: "error" },
  youtube_authorization_cleanup_unconfirmed: { title: "Review Google account access", body: "The connection did not finish and automatic authorization cleanup could not be confirmed. Review third-party access in your Google account before trying again.", tone: "error" },
};
function mapState(value: string): YouTubeChannelSummary["status"] { if (value === "connected" || value === "active") return "connected"; if (["syncing", "refreshing", "revoking"].includes(value)) return "refreshing"; if (["revoked", "expired", "needs_attention", "reconnect_required"].includes(value)) return "revoked"; if (value === "quota_limited") return "quota_limited"; return "error"; }
function overall(channels: YouTubeChannelSummary[]): YouTubeConnectionStatus { if (!channels.length) return "not_connected"; for (const state of ["revoked", "quota_limited", "refreshing", "connected"] as const) if (channels.some((channel) => channel.status === state)) return state; return "error"; }
export default async function YouTubeSettingsPage({ searchParams }: { searchParams: Promise<{ youtube?: string }> }) {
  const session = await getWorkspacePageSession("/settings/youtube");
  const outcome = outcomes[(await searchParams).youtube ?? ""];
  let status: YouTubeConnectionStatus = session.mode === "demo" ? "configuration_required" : "not_connected";
  let channels: YouTubeChannelSummary[] = [];
  let candidates: YouTubeOwnedChannelCandidate[] = [];
  if (session.source && session.workspaceId) {
    const [result, latestSync] = await Promise.all([
      session.source.channels(session.workspaceId),
      session.source.latestYoutubeSync(session.workspaceId),
    ]);
    if (isDataError(result) || isDataError(latestSync)) status = "error";
    else {
      const syncOverride = youtubeSyncViewOverride(latestSync.data);
      const active = result.data.filter((channel) => channel.connection_state === "active" || channel.connection_state === "connected");
      const selected = active.filter((channel) => channel.is_selected);
      if (active.length > 1 && selected.length === 0) {
        candidates = active.map((channel) => ({ id: channel.id, title: channel.title, handle: channel.handle }));
        status = "select_channel";
      } else {
        const visible = selected.length ? selected : active.length === 1 ? active : result.data;
        channels = visible.map((channel) => ({ id: channel.id, title: channel.title, handle: channel.handle, lastSyncedAt: channel.last_synced_at, status: mapState(channel.connection_state) }));
        status = overall(channels);
        if (status === "connected" && syncOverride) status = syncOverride;
      }
    }
  }
  return <WorkspaceShell activePath="/settings" title="YouTube connection" description="Read-only Google authorization and channel lifecycle status." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    <nav className="settings-breadcrumb" aria-label="Settings breadcrumb"><a href="/settings">Settings</a><span aria-hidden="true">/</span><span aria-current="page">YouTube</span></nav>
    {outcome ? <PageStateNotice title={outcome.title} tone={outcome.tone ?? "neutral"}><p>{outcome.body}</p></PageStateNotice> : null}
    <YouTubeConnectionPanel status={status} workspaceId={session.workspaceId} channels={channels} candidates={candidates} />
  </WorkspaceShell>;
}
