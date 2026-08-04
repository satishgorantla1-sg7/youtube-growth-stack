"use client";

import { useRef, useState } from "react";
import type { ResearchDisplayState } from "@/lib/research/explorer";

type Props = {
  runId: string;
  state: ResearchDisplayState;
  canManage: boolean;
  navigate?: (href: string) => void;
  refresh?: () => void;
};

type Action = "retry" | "cancel" | null;
type Notice = { tone: "success" | "error"; message: string } | null;

function defaultNavigate(href: string) { window.location.assign(href); }
function defaultRefresh() { window.location.reload(); }

export function ResearchLifecycleControls({ runId, state, canManage, navigate = defaultNavigate, refresh = defaultRefresh }: Props) {
  const [action, setAction] = useState<Action>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const retryIdempotencyKey = useRef<string | null>(null);
  const retryable = ["completed", "failed", "cancelled", "dead_letter", "configuration_required"].includes(state);
  const cancellable = state === "queued" || state === "running";

  function open(next: Exclude<Action, null>) { if (next === "retry" && !retryIdempotencyKey.current) retryIdempotencyKey.current = `research-retry-${crypto.randomUUID()}`; setAction(next); setConfirmed(false); setNotice(null); }
  function close() { if (!submitting) { setAction(null); setConfirmed(false); } }

  async function requestRetry() {
    setSubmitting(true); setNotice(null);
    try {
      const response = await fetch(`/api/research/${runId}/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: retryIdempotencyKey.current }) });
      const payload = await response.json().catch(() => ({})) as { approvalId?: unknown; state?: unknown };
      if (!response.ok || typeof payload.approvalId !== "string" || payload.state !== "awaiting_approval") {
        setNotice({ tone: "error", message: response.status === 403 ? "Only a workspace owner or admin can request this retry." : "The retry approval could not be created. The original run was not changed." });
        return;
      }
      setNotice({ tone: "success", message: "A pending approval was created. Research has not started or consumed credits." });
      navigate(`/approvals?research_retry=pending&approval=${encodeURIComponent(payload.approvalId)}`);
    } catch { setNotice({ tone: "error", message: "The retry approval could not be created. Check your connection and try again." }); }
    finally { setSubmitting(false); }
  }

  async function requestCancellation() {
    setSubmitting(true); setNotice(null);
    try {
      const response = await fetch(`/api/research/${runId}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: note.trim() || undefined }) });
      const payload = await response.json().catch(() => ({})) as { state?: unknown };
      if (!response.ok || (payload.state !== "cancelled" && payload.state !== "cancelling")) {
        setNotice({ tone: "error", message: response.status === 403 ? "Only a workspace owner or admin can cancel this run." : "Cancellation could not be recorded. The run may already be terminal; refresh to check its state." });
        return;
      }
      setNotice({ tone: "success", message: payload.state === "cancelled" ? "The queued run was cancelled and its unused reservation was released." : "Cancellation was recorded. In-flight work is stopping before another paid provider call." });
      refresh();
    } catch { setNotice({ tone: "error", message: "Cancellation could not be recorded. Check your connection and try again." }); }
    finally { setSubmitting(false); }
  }

  if (!retryable && !cancellable) return null;
  return <div className="research-lifecycle">
    <div className="research-lifecycle-actions">
      {retryable ? <button type="button" onClick={() => open("retry")} disabled={!canManage || submitting}>Request retry approval</button> : null}
      {cancellable ? <button className="research-cancel-trigger" type="button" onClick={() => open("cancel")} disabled={!canManage || submitting}>Cancel run</button> : null}
      {!canManage ? <span>Only a workspace owner or admin can manage paid research runs.</span> : null}
    </div>
    {action === "retry" ? <section className="research-confirmation" aria-labelledby="retry-confirmation-title">
      <h2 id="retry-confirmation-title">Request a retry approval?</h2>
      <p>This copies the prior plan into a new pending approval. It does not queue research, reserve credits, or call a provider.</p>
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand research will only run after a separate approval.</label>
      <div><button type="button" onClick={requestRetry} disabled={!confirmed || submitting}>{submitting ? "Creating approval…" : "Create pending approval"}</button><button type="button" onClick={close} disabled={submitting}>Keep original only</button></div>
    </section> : null}
    {action === "cancel" ? <section className="research-confirmation" aria-labelledby="cancel-confirmation-title">
      <h2 id="cancel-confirmation-title">Cancel this research run?</h2>
      <p>This audited action stops queued work immediately or asks an active worker to stop before another provider call. Already incurred usage is retained.</p>
      <label>Reason (optional)<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label>
      <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand cancellation cannot undo provider work already completed.</label>
      <div><button className="research-cancel-confirm" type="button" onClick={requestCancellation} disabled={!confirmed || submitting}>{submitting ? "Recording cancellation…" : "Confirm cancellation"}</button><button type="button" onClick={close} disabled={submitting}>Keep running</button></div>
    </section> : null}
    {notice ? <p className={`research-lifecycle-notice notice-${notice.tone}`} role="status">{notice.message}</p> : null}
  </div>;
}
