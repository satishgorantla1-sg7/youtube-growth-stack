import { GrowthWorkspace } from "@/components/growth-workspace";
import { signOut } from "@/app/auth/actions";
import { hasSupabaseConfig } from "@/lib/env";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  if (!hasSupabaseConfig()) return <GrowthWorkspace />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const membership = await ensureWorkspace(supabase);
  if (!membership.workspaceId) redirect("/onboarding");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", membership.workspaceId)
    .single();
  const fullName = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : undefined;
  const displayName = fullName || user.email?.split("@")[0] || "Creator";

  return <GrowthWorkspace displayName={displayName} workspaceName={workspace?.name ?? "Creator workspace"} signOutAction={signOut} />;
}
