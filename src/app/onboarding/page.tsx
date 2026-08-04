import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { createWorkspace } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { hasSupabaseConfig } from "@/lib/env";

export const metadata = {
  title: "Set up your workspace · YouTube Growth Stack",
  description: "Create a workspace, connect a channel, and choose how to use voice.",
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; stage?: string }>;
}) {
  const params = await searchParams;
  if (!hasSupabaseConfig()) return <OnboardingFlow />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = params.stage === "channel" ? "/onboarding?stage=channel" : "/onboarding";
    redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  }

  const current = await ensureWorkspace(supabase);
  const metadata = user.user_metadata as Record<string, unknown>;
  if (current.workspaceId) {
    if (params.stage !== "channel") redirect("/");
    redirect("/settings/youtube");
  }

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
