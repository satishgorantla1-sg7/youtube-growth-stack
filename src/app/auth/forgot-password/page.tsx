import { AuthShell } from "@/components/auth-shell";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  return <AuthShell title="Reset your password" description="Enter your account email and we’ll send you a secure recovery link."><PasswordRecoveryForm action={requestPasswordReset} mode="request" /></AuthShell>;
}
