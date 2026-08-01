"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthActionState } from "@/lib/auth/validation";

type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

export function PasswordRecoveryForm({ action, mode }: { action: AuthAction; mode: "request" | "update" }) {
  const [state, formAction, pending] = useActionState(action, {});
  const updating = mode === "update";
  return (
    <form action={formAction} className="auth-form">
      {updating ? (
        <>
          <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></label>
        </>
      ) : <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
      {state.error ? <p className="form-alert" role="alert">{state.error}</p> : null}
      {state.message ? <p className="form-success" role="status">{state.message}</p> : null}
      <button className="auth-submit" type="submit" disabled={pending}>{pending ? "Please wait…" : updating ? "Save new password" : "Send reset link"}</button>
      <p className="auth-switch"><Link href="/auth/sign-in">Back to sign in</Link></p>
    </form>
  );
}
