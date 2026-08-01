import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { hasSupabaseConfig } from "@/lib/env";
import { signUp } from "../actions";

export default function SignUpPage() {
  return (
    <AuthShell title="Create your workspace" description="Start with an owner account and a private workspace for your channel research.">
      <AuthForm action={signUp} mode="sign-up" />
      {!hasSupabaseConfig() ? <p className="demo-note">Supabase is not configured. <Link href="/">Continue in demo mode</Link>.</p> : null}
    </AuthShell>
  );
}
