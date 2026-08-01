"use server";

import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/auth/workspace";
import {
  firstValidationError,
  safeNextPath,
  signInSchema,
  signUpSchema,
  workspaceSchema,
  type AuthActionState,
} from "@/lib/auth/validation";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function unavailable(): AuthActionState {
  return { error: "Authentication is not configured. Continue in demo mode or add the Supabase environment variables." };
}

function workspaceError(message: string): AuthActionState {
  if (message.toLowerCase().includes("slug") || message.toLowerCase().includes("duplicate")) {
    return { error: "That workspace URL is already in use. Choose another." };
  }
  return { error: "We couldn’t create the workspace. Please try again." };
}

export async function signIn(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseConfig()) return unavailable();

  const parsed = signInSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
    next: field(formData, "next"),
  });
  if (!parsed.success) return { error: firstValidationError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "The email or password is incorrect." };

  const workspace = await ensureWorkspace(supabase);
  redirect(workspace.workspaceId ? safeNextPath(parsed.data.next) : "/onboarding");
}

export async function signUp(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseConfig()) return unavailable();

  const values = {
    displayName: field(formData, "displayName"),
    workspaceName: field(formData, "workspaceName"),
    workspaceSlug: field(formData, "workspaceSlug"),
    email: field(formData, "email"),
    password: field(formData, "password"),
  };
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) return { error: firstValidationError(parsed.error), fields: values };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const result = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl.replace(/\/$/, "")}/auth/callback`,
      data: {
        full_name: parsed.data.displayName,
        pending_workspace_name: parsed.data.workspaceName,
        pending_workspace_slug: parsed.data.workspaceSlug,
      },
    },
  });

  if (result.error) return { error: result.error.message, fields: values };
  if (!result.data.session) {
    return { message: "Check your email to confirm your account. We’ll finish creating the workspace when you return." };
  }

  const workspace = await ensureWorkspace(supabase, parsed.data);
  if (workspace.error) redirect("/onboarding?error=workspace");
  redirect("/onboarding?stage=channel");
}

export async function createWorkspace(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!hasSupabaseConfig()) return unavailable();

  const values = {
    workspaceName: field(formData, "workspaceName"),
    workspaceSlug: field(formData, "workspaceSlug"),
  };
  const parsed = workspaceSchema.safeParse(values);
  if (!parsed.success) return { error: firstValidationError(parsed.error), fields: values };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=%2Fonboarding");

  const workspace = await ensureWorkspace(supabase, parsed.data);
  if (workspace.error) return { ...workspaceError(workspace.error), fields: values };
  redirect("/onboarding?stage=channel");
}

export async function signOut() {
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/auth/sign-in");
}
