import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { researchRequestSchema } from "@/lib/schemas";
import { researchJobRepository } from "@/lib/research/repository";
import { paidResearchProvidersEnabled } from "@/lib/research/safety-readiness";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = researchRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid research request", issues: parsed.error.issues }, { status: 400 });
  if (!isDemoMode() && !paidResearchProvidersEnabled()) {
    return NextResponse.json({ error: "research_provider_disabled", message: "Paid research is disabled by an administrator. No provider call or approval was created." }, { status: 503 });
  }
  try {
    const run = await researchJobRepository().createOrGet(parsed.data);
    return NextResponse.json({
      runId: run.id, approvalId: run.approvalId, correlationId: run.correlationId,
      state: run.state, created: run.created, plan: run.plan,
      message: `Research is capped at ${run.plan.maxSources} sources and an estimated ${run.plan.estimatedCredits} credits. Explicit approval is required before it is queued.`,
    }, { status: run.created ? 201 : 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "research_run_failed";
    const status = code === "authentication_required" ? 401 : code === "workspace_required" ? 400 : 409;
    return NextResponse.json({ error: code }, { status });
  }
}
