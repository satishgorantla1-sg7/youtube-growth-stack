"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthActionState } from "@/lib/auth/validation";

type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

type Props = {
  action: AuthAction;
  mode: "sign-in" | "sign-up" | "workspace";
  next?: string;
  initialError?: string;
  defaults?: { workspaceName?: string; workspaceSlug?: string };
};

const initialState: AuthActionState = {};

export function AuthForm({ action, mode, next, initialError, defaults }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const signingUp = mode === "sign-up";
  const workspaceOnly = mode === "workspace";
  const error = state.error ?? initialError;

  return (
    <form action={formAction} className="auth-form">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {signingUp ? (
        <label>
          Your name
          <input name="displayName" autoComplete="name" required minLength={2} maxLength={80} defaultValue={state.fields?.displayName} />
        </label>
      ) : null}
      {signingUp || workspaceOnly ? (
        <>
          <label>
            Workspace name
            <input name="workspaceName" required maxLength={80} defaultValue={state.fields?.workspaceName ?? defaults?.workspaceName} />
          </label>
          <label>
            Workspace URL
            <span className="slug-input"><span aria-hidden="true">/</span><input name="workspaceSlug" required maxLength={63} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={state.fields?.workspaceSlug ?? defaults?.workspaceSlug} /></span>
          </label>
        </>
      ) : null}
      {!workspaceOnly ? (
        <>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={state.fields?.email} />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required minLength={8} maxLength={72} />
          </label>
        </>
      ) : null}
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      {state.message ? <p className="form-success" role="status">{state.message}</p> : null}
      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? "Please wait…" : workspaceOnly ? "Create workspace" : signingUp ? "Create account" : "Sign in"}
      </button>
      {!workspaceOnly ? (
        <p className="auth-switch">
          {signingUp ? "Already have an account?" : "New to Growth Stack?"}{" "}
          <Link href={signingUp ? "/auth/sign-in" : "/auth/sign-up"}>{signingUp ? "Sign in" : "Create one"}</Link>
        </p>
      ) : null}
    </form>
  );
}
