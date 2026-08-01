import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabaseConfig } from "@/lib/env";
import type { SourceType } from "@/lib/providers/types";
import { researchDispatchStatus } from "@/lib/research/dispatcher";
import { demoResearchRunStatus } from "@/lib/research/repository";
import { scheduleResearchDispatch } from "@/lib/research/schedule";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const runIdSchema = z.string().uuid();
const requestedSourcesSchema = z.array(z.enum(["youtube", "web"])).min(1).max(2);

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const parsedRunId = runIdSchema.safeParse((await context.params).runId);
  if (!parsedRunId.success) return NextResponse.json({ error: "invalid_research_run" }, { status: 400 });

  if (!hasSupabaseConfig()) {
    const run = demoResearchRunStatus(parsedRunId.data);
    if (!run) return NextResponse.json({ error: "research_run_not_found" }, { status: 404 });
    const execution = run.state === "queued"
      ? scheduleResearchDispatch()
      : researchDispatchStatus();
    return NextResponse.json({
      runId: run.runId,
      state: run.state,
      prompt: run.prompt,
      errorCode: null,
      updatedAt: null,
      completedAt: run.state === "completed" ? new Date().toISOString() : null,
      execution,
      sources: run.sources,
    });
  }

  const client = await createClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });

  const { data: run, error: runError } = await client
    .from("research_runs")
    .select("id,state,prompt,error_code,updated_at,completed_at")
    .eq("id", parsedRunId.data)
    .maybeSingle();
  if (runError) return NextResponse.json({ error: "research_status_unavailable" }, { status: 500 });
  if (!run) return NextResponse.json({ error: "research_run_not_found" }, { status: 404 });

  const [{ data: sourceRows, error: sourceError }, { data: jobRow }] = await Promise.all([
    client
      .from("research_sources")
      .select("provider,source_type,url,title,captured_at,provenance")
      .eq("research_run_id", run.id)
      .order("captured_at", { ascending: true }),
    client
      .from("jobs")
      .select("payload")
      .eq("research_run_id", run.id)
      .maybeSingle(),
  ]);
  if (sourceError) return NextResponse.json({ error: "research_sources_unavailable" }, { status: 500 });

  const payload = jobRow?.payload as { sources?: unknown } | null;
  const requested = requestedSourcesSchema.safeParse(payload?.sources);
  const requestedSources: SourceType[] = requested.success ? requested.data : ["youtube", "web"];
  const execution = run.state === "queued"
    ? scheduleResearchDispatch(requestedSources)
    : researchDispatchStatus(requestedSources);

  return NextResponse.json({
    runId: run.id,
    state: run.state,
    prompt: run.prompt,
    errorCode: run.error_code,
    updatedAt: run.updated_at,
    completedAt: run.completed_at,
    execution,
    sources: (sourceRows ?? []).map((source) => ({
      provider: source.provider,
      type: source.source_type,
      url: source.url,
      title: source.title ?? "Untitled source",
      capturedAt: source.captured_at,
      provenance: source.provenance,
    })),
  });
}
