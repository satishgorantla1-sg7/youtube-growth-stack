import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { hasSupabaseConfig } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/validation";
import { signIn } from "../actions";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const callbackError = params.error ? "We couldn’t complete that sign-in link. Request a new one or sign in below." : undefined;

  return (
    <AuthShell title="Welcome back" description="Sign in to continue to your research and content workspace.">
      <AuthForm action={signIn} mode="sign-in" next={next} initialError={callbackError} />
      {!hasSupabaseConfig() ? <p className="demo-note">Supabase is not configured. <Link href="/">Continue in demo mode</Link>.</p> : null}
    </AuthShell>
  );
}
