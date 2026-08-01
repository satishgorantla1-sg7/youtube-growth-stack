import { NextResponse } from "next/server";
import { approvalDecisionSchema } from "@/lib/schemas";
import { researchJobRepository } from "@/lib/research/repository";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = approvalDecisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval decision", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await researchJobRepository().decideApproval(parsed.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "approval_transition_failed";
    return NextResponse.json({ error: code }, { status: code === "authentication_required" ? 401 : 409 });
  }
}
