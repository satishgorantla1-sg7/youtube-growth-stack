"use client";

import { ExternalLink, LoaderCircle, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { IdeaResult, IdeaRunOption } from "@/lib/ideas/explorer";

type ApiIdea = { title: string; premise: string; demandScore: number; relevanceScore: number; competitionScore: number; confidenceScore: number; evidenceSourceIds: string[] };
type ApiResponse = { ideas?: ApiIdea[]; reused?: boolean; error?: string };
const messages: Record<string, string> = {
  invalid_evidence: "One or more selected sources are no longer available. Refresh and select evidence again.",
  completed_research_required: "Ideas can only be generated from a completed research run with saved evidence.",
  idea_generation_forbidden: "Your workspace role does not allow idea generation.",
  idea_generation_conflict: "This request conflicts with an earlier attempt. Select the sources again.",
  idea_generation_unavailable: "Idea generation is not configured on the server yet.",
  generation_failed: "Idea generation stopped safely. No unverified result was shown.",
};

function Score({ label, value }: { label: string; value: number }) {
  return <div className="idea-score"><span>{label}</span><strong>{Math.round(value)}</strong><meter min="0" max="100" value={value} aria-label={`${label} score ${Math.round(value)} out of 100`} /></div>;
}

function EvidenceLinks({ sources }: { sources: IdeaRunOption["evidence"] }) {
  return <ul className="idea-citations" aria-label="Evidence used">{sources.map((source) => <li key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={12} /></a> : <span>{source.title}</span>}</li>)}</ul>;
}

export function IdeaWorkbench({ runs, ideas, canGenerate }: { runs: IdeaRunOption[]; ideas: IdeaResult[]; canGenerate: boolean }) {
  const router = useRouter();
  const [runId, setRunId] = useState(runs[0]?.id ?? "");
  const run = useMemo(() => runs.find((item) => item.id === runId), [runs, runId]);
  const [selected, setSelected] = useState<string[]>(run?.evidence.slice(0, 3).map(({ id }) => id) ?? []);
  const [maxIdeas, setMaxIdeas] = useState(3);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ApiIdea[]>([]);

  function chooseRun(value: string) {
    const next = runs.find((item) => item.id === value);
    setRunId(value); setSelected(next?.evidence.slice(0, 3).map(({ id }) => id) ?? []); setPreview([]); setStatus("idle"); setMessage("");
  }
  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 10 ? [...current, id] : current);
  }
  async function generate() {
    if (!run || selected.length === 0 || status === "working") return;
    setStatus("working"); setMessage("Generating evidence-backed preview…"); setPreview([]);
    try {
      const response = await fetch("/api/ideas/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ researchRunId: run.id, evidenceSourceIds: selected, maxIdeas, idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json().catch(() => ({})) as ApiResponse;
      if (!response.ok) throw new Error(body.error ?? "generation_failed");
      setPreview(body.ideas ?? []); setStatus("done");
      setMessage(body.reused ? "This request was already completed. Its saved results are below." : "Ideas were saved with their evidence and internal scores.");
      router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "generation_failed";
      setStatus("error"); setMessage(messages[code] ?? messages.generation_failed);
    }
  }

  return <div className="ideas-workbench">
    <section className="panel idea-generator" aria-labelledby="idea-generator-title">
      <div className="idea-generator-heading"><div><span className="eyebrow"><Sparkles size={13}/>Evidence to ideas</span><h2 id="idea-generator-title">Generate from completed research</h2></div><span className="idea-preview-badge">Preview scoring</span></div>
      <p className="idea-generator-note">Select the sources the generator may use. Demand and competition scores are our deterministic preview analysis—not live YouTube metrics.</p>
      {runs.length ? <>
        <label className="idea-field">Research run<select value={runId} onChange={(event) => chooseRun(event.target.value)}>{runs.map((item) => <option value={item.id} key={item.id}>{item.prompt}</option>)}</select></label>
        <fieldset className="evidence-selector"><legend>Evidence sources <span>{selected.length}/10 selected</span></legend>{run?.evidence.map((source) => <label key={source.id}><input type="checkbox" checked={selected.includes(source.id)} onChange={() => toggle(source.id)} disabled={!selected.includes(source.id) && selected.length >= 10}/><span><strong>{source.title}</strong>{source.preview ? <small>{source.preview}</small> : <small>No text preview saved.</small>}</span></label>)}</fieldset>
        <div className="idea-generator-actions"><label>Number of ideas<select value={maxIdeas} onChange={(event) => setMaxIdeas(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label><button type="button" onClick={generate} disabled={!canGenerate || selected.length === 0 || status === "working"}>{status === "working" ? <LoaderCircle className="idea-spinner" size={16}/> : <Sparkles size={16}/>}Generate ideas</button></div>
        {!canGenerate ? <p className="idea-role-note">Only workspace owners, admins, and editors can generate ideas.</p> : null}
        <p className={`idea-generation-status status-${status}`} aria-live="polite">{message}</p>
      </> : <div className="idea-empty"><strong>No eligible research yet</strong><p>Complete a research run with saved evidence, then return here to choose its sources.</p><Link href="/research">View research</Link></div>}
    </section>
    {preview.length ? <section className="idea-preview" aria-labelledby="idea-preview-title"><h2 id="idea-preview-title">Just generated</h2><div className="workspace-record-list">{preview.map((idea, index) => { const sources = idea.evidenceSourceIds.map((id) => run?.evidence.find((source) => source.id === id)).filter((source): source is IdeaRunOption["evidence"][number] => Boolean(source)); return <article className="panel idea-result-card" key={`${idea.title}-${index}`}><span className="idea-preview-badge">Saved preview</span><h3>{idea.title}</h3><p>{idea.premise}</p><div className="idea-score-grid"><Score label="Demand" value={idea.demandScore}/><Score label="Relevance" value={idea.relevanceScore}/><Score label="Competition" value={idea.competitionScore}/><Score label="Confidence" value={idea.confidenceScore}/></div><EvidenceLinks sources={sources}/></article>; })}</div></section> : null}
    <section className="idea-library" aria-labelledby="idea-library-title"><div className="idea-library-heading"><span className="eyebrow">Saved library</span><h2 id="idea-library-title">Evidence-grounded ideas</h2></div>{ideas.length ? <div className="workspace-record-list">{ideas.map((idea) => <article className="panel idea-result-card" key={idea.id}><div className="idea-card-heading"><span className="status-pill">{idea.status}</span><span>Internal score {Math.round(idea.score)}</span></div><h3>{idea.title}</h3><p>{idea.premise}</p><div className="idea-score-grid"><Score label="Demand" value={idea.demandScore}/><Score label="Relevance" value={idea.relevanceScore}/><Score label="Competition" value={idea.competitionScore}/><Score label="Confidence" value={idea.confidenceScore}/></div><EvidenceLinks sources={idea.evidence}/><small className="idea-model-note">Generated by {idea.modelVersion}. Scores are internal analysis.</small></article>)}</div> : <div className="idea-empty panel"><strong>No saved ideas yet</strong><p>Select evidence above and explicitly generate the first set.</p></div>}</section>
  </div>;
}
