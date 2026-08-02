"use client";

import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, RefreshCw, ShieldCheck, Unplug, Youtube } from "lucide-react";
import { useState } from "react";

export type YouTubeConnectionStatus = "configuration_required" | "not_connected" | "select_channel" | "connected" | "refreshing" | "revoked" | "quota_limited" | "error";
export type YouTubeChannelSummary = { id: string; title: string; handle: string | null; lastSyncedAt: string | null; status: Exclude<YouTubeConnectionStatus, "configuration_required" | "not_connected" | "select_channel"> };
export type YouTubeOwnedChannelCandidate = { id: string; title: string; handle: string | null };
export type YouTubeAuthorization = { workspaceId: string; approvalId: string };
type Props = { status: YouTubeConnectionStatus; workspaceId?: string | null; channels?: YouTubeChannelSummary[]; candidates?: YouTubeOwnedChannelCandidate[]; authorization?: YouTubeAuthorization | null; navigate?: (url: string) => void };

const copy: Record<YouTubeConnectionStatus, [string, string]> = {
  configuration_required: ["YouTube connection is not configured", "The server needs Google OAuth credentials before a workspace can request read-only channel access."],
  not_connected: ["No YouTube channel connected", "Review and approve read-only access, then continue to Google to choose an account you own or manage."],
  select_channel: ["Choose an owned channel", "This Google account manages more than one channel. Choose the channel to use in this workspace."],
  connected: ["YouTube is connected", "The workspace has read-only channel access. Growth Stack cannot publish or change your channel through this connection."],
  refreshing: ["Refreshing channel data", "A bounded read-only sync is in progress. Existing imported data remains available while it completes."],
  revoked: ["YouTube access needs attention", "Google access was revoked or expired. Approve reconnection before continuing to Google again."],
  quota_limited: ["YouTube quota is temporarily limited", "No additional sync can start until the provider quota recovers. Existing imported data is unchanged."],
  error: ["Connection status is unavailable", "We could not verify the YouTube connection. No channel action was attempted."],
};
const formatDate = (value: string | null) => value ? `Last synchronized ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))}` : "Never synchronized";
const icon = (status: YouTubeConnectionStatus) => status === "connected" ? <CheckCircle2 aria-hidden="true" /> : status === "refreshing" ? <RefreshCw aria-hidden="true" /> : status === "not_connected" || status === "select_channel" ? <Youtube aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />;

export function YouTubeConnectionPanel({ status, workspaceId = null, channels = [], candidates = [], authorization = null, navigate = (url) => window.location.assign(url) }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [title, body] = copy[status];
  const reconnecting = status === "revoked";

  async function authorize(approved: YouTubeAuthorization) {
    const response = await fetch("/api/integrations/youtube/authorize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(approved) });
    const result = await response.json() as { authorizationUrl?: string; error?: string };
    if (!response.ok || !result.authorizationUrl) throw new Error(result.error ?? "authorization_failed");
    const target = new URL(result.authorizationUrl);
    if (target.protocol !== "https:" || target.hostname !== "accounts.google.com") throw new Error("authorization_url_invalid");
    navigate(target.toString());
  }

  async function continueWithExistingApproval() {
    if (!authorization || busy) return;
    setBusy(true); setMessage(null);
    try { await authorize(authorization); }
    catch (error) { setMessage(error instanceof Error && error.message === "youtube_oauth_not_configured" ? "YouTube OAuth is not configured on the server." : "Google authorization could not start. No connection was changed."); }
    finally { setBusy(false); }
  }

  async function approveAndContinue() {
    if (!workspaceId || !confirmed || busy) return;
    setBusy(true); setMessage(null);
    try {
      const pendingResponse = await fetch("/api/integrations/youtube/approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const pending = await pendingResponse.json() as { approvalId?: string; error?: string };
      if (!pendingResponse.ok || !pending.approvalId) throw new Error(pending.error ?? "approval_creation_failed");
      const decisionResponse = await fetch(`/api/integrations/youtube/approval/${encodeURIComponent(pending.approvalId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "approved", note: "Confirmed read-only YouTube scope in connection settings." }) });
      const decision = await decisionResponse.json() as { state?: string; error?: string };
      if (!decisionResponse.ok || decision.state !== "approved") throw new Error(decision.error ?? "approval_decision_failed");
      await authorize({ workspaceId, approvalId: pending.approvalId });
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setMessage(code === "youtube_oauth_not_configured" ? "YouTube OAuth is not configured on the server." : code === "workspace_access_denied" ? "Your workspace role cannot approve this connection." : "The approval or Google authorization could not complete. No channel was connected.");
    } finally { setBusy(false); }
  }

  return <div className="youtube-settings-stack">
    <section className={`panel youtube-status youtube-status-${status}`} aria-labelledby="youtube-status-title"><div className="youtube-status-icon">{icon(status)}</div><div className="youtube-status-copy"><p className="youtube-eyebrow">Read-only YouTube connection</p><h2 id="youtube-status-title">{title}</h2><p>{body}</p>{message ? <p className="youtube-action-message" role="alert">{message}</p> : null}
      {status === "not_connected" || status === "revoked" ? <div className="youtube-actions">{authorization ? <button className="youtube-primary-action" type="button" onClick={continueWithExistingApproval} disabled={busy}><ExternalLink size={16} aria-hidden="true" />{busy ? "Opening Google…" : reconnecting ? "Reconnect with Google" : "Continue with Google"}</button> : <button className="youtube-primary-action" type="button" onClick={() => setReviewing(true)} disabled={!workspaceId || busy}><ShieldCheck size={16} aria-hidden="true" />{reconnecting ? "Review reconnection scope" : "Review connection scope"}</button>}{!workspaceId ? <p><ShieldCheck size={15} aria-hidden="true" />Sign in to a configured workspace before connecting.</p> : <p><ShieldCheck size={15} aria-hidden="true" />Google authorization starts only after explicit approval.</p>}</div> : null}
      {reviewing && !authorization ? <section className="youtube-scope-review" aria-labelledby="youtube-scope-title"><h3 id="youtube-scope-title">Confirm read-only access</h3><ul><li>View the YouTube channels this Google account owns or manages.</li><li>Read channel, playlist, and video information for research and performance snapshots.</li><li>Growth Stack cannot upload, publish, edit, or delete YouTube content with this scope.</li></ul><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I understand the scope and approve this one connection action.</span></label><div className="youtube-actions"><button className="youtube-primary-action" type="button" onClick={approveAndContinue} disabled={!confirmed || busy}>{busy ? "Preparing Google…" : "Approve and continue"}</button><button type="button" onClick={() => { setReviewing(false); setConfirmed(false); }} disabled={busy}>Cancel</button></div></section> : null}
    </div></section>
    {status === "select_channel" ? <section className="panel youtube-channel-picker" aria-labelledby="owned-channel-title"><div className="panel-heading"><div><p className="youtube-eyebrow">Google account</p><h2 id="owned-channel-title">Owned and Brand channels</h2></div><span className="status-pill">{candidates.length} available</span></div>{candidates.length ? <fieldset disabled><legend>Select one channel</legend>{candidates.map((candidate) => <label key={candidate.id}><input type="radio" name="youtube-channel" value={candidate.id} /><span><strong>{candidate.title}</strong><small>{candidate.handle ?? "No public handle"}</small></span></label>)}<p className="youtube-unavailable"><Clock3 size={15} aria-hidden="true" />Selection will be enabled when the secure channel-selection endpoint is available.</p></fieldset> : <p className="youtube-unavailable"><AlertTriangle size={15} aria-hidden="true" />No owned channels were returned. Try a different Google account.</p>}</section> : null}
    {channels.length ? <section className="youtube-channel-list" aria-label="Connected YouTube channels">{channels.map((channel) => <article className="panel youtube-channel-card" key={channel.id}><div className="youtube-channel-heading"><span className="youtube-channel-mark"><Youtube aria-hidden="true" /></span><div><h2>{channel.title}</h2><p>{channel.handle ?? "No public handle"}</p></div><span className={`status-pill youtube-channel-state-${channel.status}`}>{channel.status.replaceAll("_", " ")}</span></div><p>{formatDate(channel.lastSyncedAt)}</p><div className="youtube-actions youtube-lifecycle-actions" aria-label={`Actions for ${channel.title}`}><button type="button" disabled><RefreshCw size={15} aria-hidden="true" />Sync unavailable</button><button type="button" disabled><Unplug size={15} aria-hidden="true" />Disconnect unavailable</button></div><p className="youtube-unavailable"><Clock3 size={15} aria-hidden="true" />Sync and disconnect controls will be enabled only after their audited server endpoints are delivered.</p></article>)}</section> : null}
    <section className="panel youtube-danger-zone" aria-labelledby="youtube-data-title"><div><p className="youtube-eyebrow">Imported data</p><h2 id="youtube-data-title">Delete imported YouTube data</h2><p>Disconnecting Google access and deleting imported data are separate actions. Deletion requires a new explicit approval and does not delete anything from YouTube.</p></div><button type="button" disabled>Deletion approval unavailable</button></section>
  </div>;
}
