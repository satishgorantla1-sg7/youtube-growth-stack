import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { isDataError, type DashboardDataSource, type WorkspacePageContext } from "./contracts";
import { SupabaseDashboardDataSource } from "./source";

export type WorkspacePageSession = WorkspacePageContext & {
  source: DashboardDataSource | null;
  signOutAction?: typeof signOut;
};

export async function getWorkspacePageSession(pathname: string): Promise<WorkspacePageSession> {
  if (!hasSupabaseConfig()) {
    return {
      workspaceId: null,
      workspaceName: "Demo workspace",
      displayName: "Creator",
      role: "owner",
      mode: "demo",
      source: null,
    };
  }

  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);

  const membership = await ensureWorkspace(client);
  if (!membership.workspaceId) redirect("/onboarding");

  const source = new SupabaseDashboardDataSource(client);
  const [workspace, member, counts] = await Promise.all([
    source.workspace(membership.workspaceId),
    client.from("workspace_members").select("role").eq("workspace_id", membership.workspaceId).eq("user_id", user.id).single(),
    source.navigationCounts(membership.workspaceId),
  ]);
  if (isDataError(workspace)) throw new Error("Workspace data is temporarily unavailable.");

  const metadata = user.user_metadata as Record<string, unknown>;
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : "";
  return {
    workspaceId: membership.workspaceId,
    workspaceName: workspace.data.name,
    displayName: fullName || user.email?.split("@")[0] || "Creator",
    role: member.data?.role ?? "member",
    mode: "connected",
    navigationCounts: counts.data ?? undefined,
    source,
    signOutAction: signOut,
  };
}
