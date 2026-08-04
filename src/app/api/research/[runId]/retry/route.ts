import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const runIdSchema = z.string().uuid();
const retrySchema = z.object({ idempotencyKey: z.string().trim().min(8).max(128) });
type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const runId = runIdSchema.safeParse((await context.params).runId);
  const body = retrySchema.safeParse(await request.json().catch(() => null));
  if (!runId.success || !body.success) {
    return NextResponse.json({ error: "invalid_research_retry" }, { status: 400 });
  }
  const client = await createClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const rpc = client.rpc.bind(client) as unknown as (
    name: "retry_research_run",
    args: { target_run_id: string; request_idempotency_key: string },
  ) => RpcResult;
  const { data, error } = await rpc("retry_research_run", {
    target_run_id: runId.data,
    request_idempotency_key: body.data.idempotencyKey,
  });
  if (error) {
    const known = ["research_retry_forbidden", "research_not_retryable", "research_retry_idempotency_conflict"].includes(error.message);
    const code = known ? error.message : "research_retry_unavailable";
    const status = code === "research_retry_forbidden" ? 403 : code === "research_retry_unavailable" ? 500 : 409;
    return NextResponse.json({ error: code }, { status });
  }
  const result = data as { created?: boolean };
  return NextResponse.json(data, { status: result.created === false ? 200 : 201 });
}
