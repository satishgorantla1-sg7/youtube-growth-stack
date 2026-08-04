import { AlertTriangle, ArrowLeft, Clock3, ExternalLink, FileSearch, FolderKanban } from "lucide-react";
import Link from "next/link";
import type { ResearchFilters, ResearchHistoryResult, ResearchRunDetail } from "@/lib/research/explorer";
import { safeEvidenceUrl } from "@/lib/research/explorer";
import { ResearchLifecycleControls } from "./research-lifecycle-controls";

const labels = { awaiting_approval: "Awaiting approval", queued: "Queued", running: "Running", cancelling: "Cancelling", completed: "Completed", failed: "Failed", cancelled: "Cancelled", dead_letter: "Needs intervention", configuration_required: "Configuration required" } as const;
const explanations = {
  awaiting_approval: "Approval is required. No research is queued and no credits are reserved or consumed.", queued: "Waiting for an available research worker.", running: "Research providers are collecting bounded evidence.", cancelling: "Cancellation is recorded. In-flight work is stopping before another paid provider call.", completed: "Evidence collection finished.", failed: "This run stopped before completion.", cancelled: "This run was cancelled and no further work is scheduled.", dead_letter: "Automatic retries are exhausted. A workspace owner or admin can request a new approval before retrying.", configuration_required: "A required provider is not configured. Ask a workspace administrator to review settings.",
} as const;

function formatDate(value: string | null) { if (!value) return "Not yet"; return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)); }
function provenanceSummary(value: ResearchRunDetail["evidence"][number]["provenance"]) {
  if (!value || Array.isArray(value) || typeof value !== "object") return "Saved by the research pipeline";
  const safeKeys = new Set(["query", "author", "channel", "domain", "published_at", "extraction_method"]);
  const entries = Object.entries(value).filter(([key, item]) => safeKeys.has(key) && ["string", "number", "boolean"].includes(typeof item)).slice(0, 2);
  return entries.length ? entries.map(([key, item]) => `${key.replaceAll("_", " ")}: ${String(item).slice(0, 80)}`).join(" · ") : "Saved by the research pipeline";
}
function search(filters: ResearchFilters, page: number) { const params = new URLSearchParams(); if (filters.state !== "all") params.set("state", filters.state); if (filters.projectId) params.set("project", filters.projectId); if (filters.from) params.set("from", filters.from); if (filters.to) params.set("to", filters.to); if (page > 1) params.set("page", String(page)); const suffix = params.toString(); return suffix ? `/research?${suffix}` : "/research"; }

export function ResearchHistory({ result, filters }: { result: ResearchHistoryResult; filters: ResearchFilters }) {
  return <>
    <form className="research-filters panel" method="get" aria-label="Filter research history">
      <label>Status<select name="state" defaultValue={filters.state}><option value="all">All states</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Project<select name="project" defaultValue={filters.projectId ?? ""}><option value="">All projects</option>{result.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
      <label>From<input type="date" name="from" defaultValue={filters.from ?? ""} /></label>
      <label>To<input type="date" name="to" defaultValue={filters.to ?? ""} /></label>
      <button type="submit">Apply filters</button><Link href="/research">Clear</Link>
    </form>
    {result.items.length ? <div className="research-history" aria-label="Research runs">{result.items.map((run) => <Link className="research-run-card panel" href={`/research/${run.id}`} key={run.id}>
      <div className="research-run-heading"><span className={`research-state state-${run.state}`}>{labels[run.state]}</span><span>{run.mode} research</span></div>
      <h2>{run.prompt}</h2><p>{explanations[run.state]}</p>
      <dl><div><dt><FolderKanban size={14} />Project</dt><dd>{run.projectName ?? "Unassigned"}</dd></div><div><dt><FileSearch size={14} />Evidence</dt><dd>{run.sourceCount} source{run.sourceCount === 1 ? "" : "s"}</dd></div><div><dt><Clock3 size={14} />Created</dt><dd>{formatDate(run.createdAt)}</dd></div></dl>
    </Link>)}</div> : <section className="panel research-empty"><FileSearch size={24}/><h2>No matching research</h2><p>No workspace runs match these filters. Clear the filters or ask the growth agent to plan a new run.</p></section>}
    <nav className="research-pagination" aria-label="Research history pages"><Link aria-disabled={!result.hasPrevious} tabIndex={result.hasPrevious ? 0 : -1} href={result.hasPrevious ? search(filters, result.page - 1) : search(filters, result.page)}>Previous</Link><span>Page {result.page}</span><Link aria-disabled={!result.hasNext} tabIndex={result.hasNext ? 0 : -1} href={result.hasNext ? search(filters, result.page + 1) : search(filters, result.page)}>Next</Link></nav>
  </>;
}

export function ResearchDetail({ run, canManage = false }: { run: ResearchRunDetail; canManage?: boolean }) {
  return <div className="research-detail">
    <Link className="research-back" href="/research"><ArrowLeft size={15}/>Back to research</Link>
    <section className="panel research-detail-summary"><div className="research-run-heading"><span className={`research-state state-${run.state}`}>{labels[run.state]}</span><span>{run.mode} research</span></div><h1>{run.prompt}</h1><p>{explanations[run.state]}</p>
      <dl><div><dt>Project</dt><dd>{run.projectName ?? "Unassigned"}</dd></div><div><dt>Created</dt><dd>{formatDate(run.createdAt)}</dd></div><div><dt>Completed</dt><dd>{formatDate(run.completedAt)}</dd></div><div><dt>{run.actualCredits === null ? "Estimated credits" : "Actual credits"}</dt><dd>{run.actualCredits ?? run.estimatedCredits}</dd></div></dl>
      {run.errorCode ? <div className="research-error"><AlertTriangle size={16}/><span>Run code: {run.errorCode}</span></div> : null}
      <ResearchLifecycleControls runId={run.id} state={run.state} canManage={canManage} />
    </section>
    <section className="research-evidence-heading"><div><span className="eyebrow">Evidence explorer</span><h2>{run.evidence.length} saved source{run.evidence.length === 1 ? "" : "s"}</h2></div><p>Previews are bounded. Open the original source to inspect its full context.</p></section>
    {run.evidenceLimited ? <p className="research-limit-note">Showing the first 50 sources for a bounded, responsive view.</p> : null}
    {run.evidence.length ? <div className="research-evidence-grid">{run.evidence.map((source) => { const href = safeEvidenceUrl(source.url); return <article className="panel evidence-card" key={source.id}><div className="evidence-meta"><span>{source.provider}</span><span>{source.sourceType}</span></div><h3>{source.title}</h3><p className="evidence-provenance">Provenance · {provenanceSummary(source.provenance)}</p>{source.preview ? <p>{source.preview}</p> : <p className="evidence-no-preview">No text preview was saved for this source.</p>}<footer><time dateTime={source.capturedAt}>Captured {formatDate(source.capturedAt)}</time>{href ? <a href={href} target="_blank" rel="noreferrer">Open source<ExternalLink size={13}/></a> : <span>Source URL unavailable</span>}</footer></article>; })}</div> : <section className="panel research-empty"><FileSearch size={24}/><h2>No evidence saved yet</h2><p>{run.state === "completed" ? "This completed run did not save any source records." : "Evidence will appear here as the run completes successfully."}</p></section>}
  </div>;
}
