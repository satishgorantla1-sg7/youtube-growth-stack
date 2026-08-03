import { NextResponse } from "next/server";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { ideaGenerationInputSchema, generateIdeasForUser, IdeaGenerationServerError } from "@/lib/ideas/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ideaGenerationInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_idea_generation_request", issues: parsed.error.issues }, { status: 400 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const membership = await ensureWorkspace(client);
  if (!membership.workspaceId) return NextResponse.json({ error: "workspace_required" }, { status: 403 });
  try {
    const result = await generateIdeasForUser(client, { ...parsed.data, workspaceId: membership.workspaceId, userId: user.id });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const code = error instanceof IdeaGenerationServerError ? error.code : "generation_failed";
    const status = code === "idea_generation_forbidden" ? 403 : code === "invalid_evidence" ? 400 : code === "idea_generation_unavailable" ? 503 : 409;
    return NextResponse.json({ error: code }, { status });
  }
}
