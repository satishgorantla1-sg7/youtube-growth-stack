import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type WorkspaceInput = { workspaceName: string; workspaceSlug: string };

export async function ensureWorkspace(supabase: SupabaseClient<Database>, input?: WorkspaceInput) {
  const membership = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .limit(1)
    .maybeSingle();

  if (membership.error) return { error: membership.error.message, workspaceId: null };
  if (membership.data) return { error: null, workspaceId: membership.data.workspace_id as string };
  if (!input) return { error: "Workspace setup is incomplete.", workspaceId: null };

  const created = await supabase.rpc("create_workspace", {
    workspace_name: input.workspaceName,
    workspace_slug: input.workspaceSlug,
  });

  return {
    error: created.error?.message ?? null,
    workspaceId: (created.data as string | null) ?? null,
  };
}
