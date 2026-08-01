import { NextResponse } from "next/server";
import { researchRequestSchema } from "@/lib/schemas";
import { runResearch } from "@/lib/research/orchestrator";

export async function POST(request: Request) {
  const parsed = researchRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid research request", issues: parsed.error.issues }, { status: 400 });
  try {
    const sources = await runResearch(parsed.data.prompt, parsed.data.sources);
    return NextResponse.json({
      runId: crypto.randomUUID(), state: "awaiting_approval", sourceCount: sources.length, sources,
      message: `I analysed ${sources.length} source${sources.length === 1 ? "" : "s"}. The research plan and estimated spend are waiting for your approval before I generate the final package.`,
    });
  } catch (error) {
    console.error("research_failed", error);
    return NextResponse.json({ error: "Research provider failed safely; no approval was bypassed." }, { status: 502 });
  }
}
