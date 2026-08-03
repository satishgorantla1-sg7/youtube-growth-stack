import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const runIdSchema = z.string().uuid();
const cancellationSchema = z.object({ note: z.string().trim().max(500).optional() });

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const runId = runIdSchema.safeParse((await context.params).runId);
  const body = cancellationSchema.safeParse(await request.json().catch(() => ({})));
  if (!runId.success || !body.success) {
    return NextResponse.json({ error: "invalid_research_cancellation" }, { status: 400 });
  }
  const client = await createClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const { data, error } = await client.rpc("cancel_research_run", {
    target_run_id: runId.data,
    cancellation_note: body.data.note || undefined,
  });
  if (error) {
    const status = error.message === "research_cancel_forbidden" ? 403 : 409;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}
