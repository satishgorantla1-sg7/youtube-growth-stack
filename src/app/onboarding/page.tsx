import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { createWorkspace } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { onboardingConfigRedirect } from "@/lib/auth/boundary";
import { hasSupabaseConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const configRedirect = onboardingConfigRedirect(hasSupabaseConfig());
  if (configRedirect) redirect(configRedirect);

  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=%2Fonboarding");

  const current = await ensureWorkspace(supabase);
  if (current.workspaceId) redirect("/");

  const metadata = user.user_metadata as Record<string, unknown>;
  const defaults = {
    workspaceName: typeof metadata.pending_workspace_name === "string" ? metadata.pending_workspace_name : "",
    workspaceSlug: typeof metadata.pending_workspace_slug === "string" ? metadata.pending_workspace_slug : "",
  };

  return (
    <AuthShell title="Finish workspace setup" description="Your account is ready. Choose the private workspace your owner membership belongs to.">
      <AuthForm
        action={createWorkspace}
        mode="workspace"
        defaults={defaults}
        initialError={params.error ? "We couldn’t use that workspace URL. Review it and try again." : undefined}
      />
    </AuthShell>
  );
}
