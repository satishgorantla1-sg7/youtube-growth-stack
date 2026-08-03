"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, Unplug, Youtube } from "lucide-react";
import { useState } from "react";

export type YouTubeConnectionStatus = "configuration_required" | "not_connected" | "select_channel" | "connected" | "refreshing" | "revoked" | "quota_limited" | "error";
export type YouTubeChannelSummary = { id: string; title: string; handle: string | null; lastSyncedAt: string | null; status: Exclude<YouTubeConnectionStatus, "configuration_required" | "not_connected" | "select_channel"> };
export type YouTubeOwnedChannelCandidate = { id: string; title: string; handle: string | null };
export type YouTubeAuthorization = { workspaceId: string; approvalId: string };
type Props = {
  status: YouTubeConnectionStatus;
  workspaceId?: string | null;
  channels?: YouTubeChannelSummary[];
  candidates?: YouTubeOwnedChannelCandidate[];
  authorization?: YouTubeAuthorization | null;
  navigate?: (url: string) => void;
  refresh?: () => void;
};

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

export function YouTubeConnectionPanel({
  status, workspaceId = null, channels = [], candidates = [], authorization = null,
  navigate = (url) => window.location.assign(url), refresh = () => window.location.reload(),
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [disconnectReview, setDisconnectReview] = useState(false);
  const [disconnectConfirmed, setDisconnectConfirmed] = useState(false);
  const [revocationApprovalId, setRevocationApprovalId] = useState<string | null>(null);
  const [title, body] = copy[status];
  const reconnecting = status === "revoked";

  async function jsonPost(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "youtube_action_failed");
    return result;
  }

  async function authorize(approved: YouTubeAuthorization) {
    const result = await jsonPost("/api/integrations/youtube/authorize", approved);
    if (typeof result.authorizationUrl !== "string") throw new Error("authorization_failed");
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
      const pending = await jsonPost("/api/integrations/youtube/approval", { workspaceId });
      if (typeof pending.approvalId !== "string") throw new Error("approval_creation_failed");
      const decision = await jsonPost(`/api/integrations/youtube/approval/${encodeURIComponent(pending.approvalId)}`, { decision: "approved", note: "Confirmed read-only YouTube scope in connection settings." });
      if (decision.state !== "approved") throw new Error("approval_decision_failed");
      await authorize({ workspaceId, approvalId: pending.approvalId });
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      setMessage(code === "youtube_oauth_not_configured" ? "YouTube OAuth is not configured on the server." : code === "workspace_access_denied" ? "Your workspace role cannot approve this connection." : "The approval or Google authorization could not complete. No channel was connected.");
    } finally { setBusy(false); }
  }

  async function selectCandidate() {
    if (!workspaceId || !selectedCandidateId || busy) return;
    setBusy(true); setMessage(null);
    try {
      await jsonPost("/api/integrations/youtube/channels/select", { workspaceId, channelId: selectedCandidateId });
      setMessage("Channel selected. Refreshing the connection view…");
      refresh();
    } catch { setMessage("The channel could not be selected. No existing selection was changed."); }
    finally { setBusy(false); }
  }

  async function syncChannel(channelId: string) {
    if (!workspaceId || busy) return;
    setBusy(true); setMessage(null);
    try {
      await jsonPost("/api/integrations/youtube/sync", { workspaceId, channelId, idempotencyKey: crypto.randomUUID(), maxPages: 5, maxItems: 250 });
      setMessage("A bounded read-only sync was queued.");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "youtube_sync_disabled" ? "YouTube sync is temporarily disabled by an administrator." : "The sync could not be queued. Existing imported data is unchanged.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!workspaceId || !disconnectConfirmed || busy) return;
    setBusy(true); setMessage(null);
    try {
      let approvalId = revocationApprovalId;
      if (!approvalId) {
        const approval = await jsonPost("/api/integrations/youtube/revocation-approval", { workspaceId });
        if (typeof approval.approvalId !== "string") throw new Error("approval_creation_failed");
        approvalId = approval.approvalId;
        if (approval.state === "pending") {
          const decision = await jsonPost(`/api/integrations/youtube/approval/${encodeURIComponent(approvalId)}`, { decision: "approved", note: "Confirmed revocation of Google access. Imported data is retained." });
          if (decision.state !== "approved") throw new Error("approval_decision_failed");
        } else if (approval.state !== "approved") throw new Error("approval_creation_failed");
        setRevocationApprovalId(approvalId);
      }
      await jsonPost("/api/integrations/youtube/disconnect", { workspaceId, approvalId });
      setMessage("Google access was revoked. Imported data was retained.");
      setRevocationApprovalId(null);
      setDisconnectReview(false); setDisconnectConfirmed(false);
      refresh();
    } catch (error) { setMessage(error instanceof Error && error.message === "youtube_revocation_in_progress" ? "Revocation is still in progress. Wait for the current attempt to finish, then retry with the same approval." : "Google access could not be revoked. The approved revocation is retained for a safe retry; the connection was not reported as disconnected."); }
    finally { setBusy(false); }
  }

  return <div className="youtube-settings-stack">
    <section className={`panel youtube-status youtube-status-${status}`} aria-labelledby="youtube-status-title">
      <div className="youtube-status-icon">{icon(status)}</div>
      <div className="youtube-status-copy"><p className="youtube-eyebrow">Read-only YouTube connection</p><h2 id="youtube-status-title">{title}</h2><p>{body}</p>{message ? <p className="youtube-action-message" role="status">{message}</p> : null}
        {status === "not_connected" || status === "revoked" ? <div className="youtube-actions">{authorization ? <button className="youtube-primary-action" type="button" onClick={continueWithExistingApproval} disabled={busy}><ExternalLink size={16} aria-hidden="true" />{busy ? "Opening Google…" : reconnecting ? "Reconnect with Google" : "Continue with Google"}</button> : <button className="youtube-primary-action" type="button" onClick={() => setReviewing(true)} disabled={!workspaceId || busy}><ShieldCheck size={16} aria-hidden="true" />{reconnecting ? "Review reconnection scope" : "Review connection scope"}</button>}{!workspaceId ? <p><ShieldCheck size={15} aria-hidden="true" />Sign in to a configured workspace before connecting.</p> : <p><ShieldCheck size={15} aria-hidden="true" />Google authorization starts only after explicit approval.</p>}</div> : null}
        {reviewing && !authorization ? <section className="youtube-scope-review" aria-labelledby="youtube-scope-title"><h3 id="youtube-scope-title">Confirm read-only access</h3><ul><li>View the YouTube channels this Google account owns or manages.</li><li>Read channel, playlist, and video information for research and performance snapshots.</li><li>Growth Stack cannot upload, publish, edit, or delete YouTube content with this scope.</li></ul><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I understand the scope and approve this one connection action.</span></label><div className="youtube-actions"><button className="youtube-primary-action" type="button" onClick={approveAndContinue} disabled={!confirmed || busy}>{busy ? "Preparing Google…" : "Approve and continue"}</button><button type="button" onClick={() => { setReviewing(false); setConfirmed(false); }} disabled={busy}>Cancel</button></div></section> : null}
      </div>
    </section>
    {status === "select_channel" ? <section className="panel youtube-channel-picker" aria-labelledby="owned-channel-title"><div className="panel-heading"><div><p className="youtube-eyebrow">Google account</p><h2 id="owned-channel-title">Owned and Brand channels</h2></div><span className="status-pill">{candidates.length} available</span></div>{candidates.length ? <fieldset disabled={busy}><legend>Select one channel</legend>{candidates.map((candidate) => <label key={candidate.id}><input type="radio" name="youtube-channel" value={candidate.id} checked={selectedCandidateId === candidate.id} onChange={() => setSelectedCandidateId(candidate.id)} /><span><strong>{candidate.title}</strong><small>{candidate.handle ?? "No public handle"}</small></span></label>)}<button className="youtube-primary-action" type="button" onClick={selectCandidate} disabled={!selectedCandidateId || busy}>{busy ? "Selecting…" : "Use selected channel"}</button></fieldset> : <p className="youtube-unavailable"><AlertTriangle size={15} aria-hidden="true" />No owned channels were returned. Try a different Google account.</p>}</section> : null}
    {channels.length ? <section className="youtube-channel-list" aria-label="Connected YouTube channels">{channels.map((channel) => <article className="panel youtube-channel-card" key={channel.id}><div className="youtube-channel-heading"><span className="youtube-channel-mark"><Youtube aria-hidden="true" /></span><div><h2>{channel.title}</h2><p>{channel.handle ?? "No public handle"}</p></div><span className={`status-pill youtube-channel-state-${channel.status}`}>{channel.status.replaceAll("_", " ")}</span></div><p>{formatDate(channel.lastSyncedAt)}</p><div className="youtube-actions youtube-lifecycle-actions" aria-label={`Actions for ${channel.title}`}><button type="button" onClick={() => syncChannel(channel.id)} disabled={busy || status !== "connected" || channel.status !== "connected"}><RefreshCw size={15} aria-hidden="true" />Sync now</button><button type="button" onClick={() => setDisconnectReview(true)} disabled={busy || channel.status === "revoked"}><Unplug size={15} aria-hidden="true" />Disconnect Google</button></div></article>)}</section> : null}
    {disconnectReview ? <section className="panel youtube-scope-review" aria-labelledby="youtube-disconnect-title"><h2 id="youtube-disconnect-title">Disconnect Google access?</h2><p>This revokes the encrypted Google credential. Imported channel, video, and snapshot data is retained.</p><label><input type="checkbox" checked={disconnectConfirmed} onChange={(event) => setDisconnectConfirmed(event.target.checked)} /><span>I approve this separate revocation action and understand imported data will remain.</span></label><div className="youtube-actions"><button type="button" onClick={disconnect} disabled={!disconnectConfirmed || busy}>{busy ? "Revoking access…" : "Approve and disconnect"}</button><button type="button" onClick={() => { setDisconnectReview(false); setDisconnectConfirmed(false); }} disabled={busy}>Cancel</button></div></section> : null}
    <section className="panel youtube-danger-zone" aria-labelledby="youtube-data-title"><div><p className="youtube-eyebrow">Imported data</p><h2 id="youtube-data-title">Delete imported YouTube data</h2><p>Disconnecting Google access and deleting imported data are separate actions. Deletion requires a new explicit approval and does not delete anything from YouTube.</p></div><button type="button" disabled>Deletion approval unavailable</button></section>
  </div>;
}
