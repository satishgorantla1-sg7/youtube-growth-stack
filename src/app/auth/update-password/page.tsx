import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "../actions";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  if (!hasSupabaseConfig()) redirect("/auth/sign-in");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/forgot-password");
  return <AuthShell title="Choose a new password" description="Use at least eight characters. Your existing workspace and content will stay unchanged."><PasswordRecoveryForm action={updatePassword} mode="update" /></AuthShell>;
}
