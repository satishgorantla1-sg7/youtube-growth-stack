import { NextResponse } from "next/server";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { ContentPackageServerError } from "@/lib/packages/server";

export async function packageRequestContext() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "authentication_required" }, { status: 401 }) } as const;
  const membership = await ensureWorkspace(client);
  if (!membership.workspaceId) return { response: NextResponse.json({ error: "workspace_required" }, { status: 403 }) } as const;
  return { client, user, workspaceId: membership.workspaceId } as const;
}

export function packageErrorResponse(error: unknown) {
  const code = error instanceof ContentPackageServerError ? error.code : "package_action_failed";
  const status = code === "content_package_forbidden" ? 403
    : ["approved_idea_required", "invalid_package_evidence", "content_package_not_draft", "content_package_not_versionable", "approval_not_pending", "content_package_conflict"].includes(code) ? 409
    : code === "package_generation_unavailable" ? 503 : 500;
  return NextResponse.json({ error: code }, { status });
}
