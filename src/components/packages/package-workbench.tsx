"use client";

import { Check, ExternalLink, FileStack, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Json } from "@/lib/supabase/database.types";
import type { PackageIdeaOption, PackageVersionView } from "@/lib/packages/explorer";

const errors: Record<string, string> = {
  approved_idea_required: "That idea is no longer approved. Refresh and choose another idea.",
  invalid_package_evidence: "The approved idea needs saved evidence before a package can be generated.",
  content_package_forbidden: "Your workspace role does not allow this action.",
  content_package_not_draft: "Only a draft can be sent for approval.",
  content_package_not_versionable: "A new version can only follow an approved or rejected version.",
  approval_not_pending: "That approval has already been decided.",
  package_generation_unavailable: "Package generation is not configured on the server.",
  package_action_failed: "The action stopped safely. Refresh and try again.",
};
type ApiResponse = { error?: string };
type BusyAction = { id: string; action: string } | null;

function asRecords(value: Json): Record<string, Json>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, Json> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function text(value: Json | undefined) { return typeof value === "string" ? value : ""; }

export function PackageWorkbench({ approvedIdeas, packages, canGenerate, canDecide }: { approvedIdeas: PackageIdeaOption[]; packages: PackageVersionView[]; canGenerate: boolean; canDecide: boolean }) {
  const router = useRouter();
  const [ideaId, setIdeaId] = useState(approvedIdeas[0]?.id ?? "");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function action(id: string, name: string, url: string, body?: object) {
    if (busy) return;
    setBusy({ id, action: name }); setMessage(""); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) throw new Error(result.error ?? "package_action_failed");
      setMessage(name === "generate" ? "Draft package generated from the idea’s saved evidence."
        : name === "approval" ? "Approval requested. The package is now locked for owner/admin review."
        : name === "approved" ? "Package approved. Its immutable version is preserved."
        : name === "rejected" ? "Package rejected. A new draft version was created for revision."
        : "A new draft version was created without changing the earlier version.");
      router.refresh();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "package_action_failed";
      setError(errors[code] ?? errors.package_action_failed);
    } finally { setBusy(null); }
  }

  return <div className="package-workbench">
    <section className="panel package-generator" aria-labelledby="package-generator-title">
      <div className="package-heading"><div><span className="eyebrow"><Sparkles size={13}/>Approved idea to package</span><h2 id="package-generator-title">Generate a complete content package</h2></div><span className="package-safety-badge"><ShieldCheck size={13}/>Evidence required</span></div>
      <p>Choose an approved idea. Generation is explicit and uses only that idea’s saved research evidence; it does not publish or change your channel.</p>
      {approvedIdeas.length ? <div className="package-generator-row"><label>Approved idea<select value={ideaId} onChange={(event) => setIdeaId(event.target.value)}>{approvedIdeas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title} · {idea.evidenceCount} source{idea.evidenceCount === 1 ? "" : "s"}</option>)}</select></label><button type="button" disabled={!canGenerate || !ideaId || Boolean(busy)} onClick={() => action(ideaId, "generate", "/api/packages/generate", { ideaId, idempotencyKey: crypto.randomUUID() })}>{busy?.action === "generate" ? <LoaderCircle className="idea-spinner" size={16}/> : <FileStack size={16}/>}Generate draft package</button></div> : <div className="idea-empty"><strong>No approved ideas yet</strong><p>Approve an evidence-grounded idea before generating a package.</p></div>}
      {!canGenerate ? <p className="package-role-note">Only workspace owners, admins, and editors can generate or revise packages.</p> : null}
      <div className="package-export-disabled" aria-label="Export unavailable"><LockKeyhole size={15}/><span><strong>Export disabled</strong><small>Export is a separate approval-gated capability and cannot run in this release.</small></span><button type="button" disabled>Export</button></div>
      <p className="package-status" aria-live="polite">{error || message}</p>
    </section>
    <section className="package-library" aria-labelledby="package-library-title"><div><span className="eyebrow">Immutable history</span><h2 id="package-library-title">Package versions</h2></div>
      {packages.length ? <div className="workspace-record-list">{packages.map((item) => <article className="panel package-card" key={item.id}>
        <div className="package-card-heading"><div><span className={`status-pill package-state-${item.state}`}>{item.state.replaceAll("_", " ")}</span><span>Version {item.version}</span></div><small>{item.modelVersion} · {item.promptVersion}</small></div>
        <h3>{item.ideaTitle}</h3>
        {item.sourcePackageId ? <p className="package-version-note"><RotateCcw size={12}/>Revision of an earlier immutable version.</p> : null}
        <div className="package-content-grid"><section><h4>Titles</h4><ol>{item.titles.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ol></section><section><h4>Hooks</h4><ol>{item.hooks.map((hook, index) => <li key={`${hook}-${index}`}>{hook}</li>)}</ol></section></div>
        <details><summary>Thumbnail concepts and outline</summary><div className="package-details-grid"><section><h4>Thumbnail concepts</h4>{asRecords(item.thumbnailConcepts).map((concept, index) => <div key={index}><strong>{text(concept.concept)}</strong><p>{text(concept.visualDescription)}</p>{text(concept.overlayText) ? <small>Overlay: {text(concept.overlayText)}</small> : null}</div>)}</section><section><h4>Outline</h4>{asRecords(item.outline).map((part, index) => <div key={index}><strong>{text(part.section)}</strong><p>{text(part.purpose)}</p></div>)}</section></div></details>
        <details><summary>Script</summary><p className="package-script">{item.script}</p></details>
        <section className="package-evidence"><h4>Evidence and provenance</h4><p>Generated by {item.modelVersion} using prompt {item.promptVersion}. Sources below are the persisted citations for this exact version.</p><ul>{item.evidence.map((source) => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={12}/></a> : <span>{source.title}</span>}{source.preview ? <small>{source.preview}</small> : null}</li>)}</ul></section>
        <div className="package-actions">
          {item.state === "draft" ? <button type="button" disabled={!canGenerate || Boolean(busy)} onClick={() => action(item.id, "approval", `/api/packages/${item.id}/approval`)}><ShieldCheck size={15}/>Request approval</button> : null}
          {item.state === "awaiting_approval" && item.pendingApprovalId && canDecide ? <><button className="approve" type="button" disabled={Boolean(busy)} onClick={() => action(item.id, "approved", `/api/packages/approvals/${item.pendingApprovalId}/decision`, { decision: "approved", note: null })}><Check size={15}/>Approve version</button><button type="button" disabled={Boolean(busy)} onClick={() => action(item.id, "rejected", `/api/packages/approvals/${item.pendingApprovalId}/decision`, { decision: "rejected", note: "Revision requested in package review." })}><X size={15}/>Reject & create draft</button></> : null}
          {item.state === "approved" ? <button type="button" disabled={!canGenerate || Boolean(busy)} onClick={() => action(item.id, "next", `/api/packages/${item.id}/next`, { idempotencyKey: crypto.randomUUID() })}><RotateCcw size={15}/>Create next version</button> : null}
        </div>
      </article>)}</div> : <div className="idea-empty panel"><strong>No package history yet</strong><p>Choose an approved idea above to create the first evidence-grounded draft.</p></div>}
    </section>
  </div>;
}
