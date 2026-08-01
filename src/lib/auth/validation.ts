import { z } from "zod";

const email = z.string().trim().email("Enter a valid email address.").max(254);
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

export const signInSchema = z.object({
  email,
  password,
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(80),
  workspaceName: z.string().trim().min(1, "Name your workspace.").max(80),
  workspaceSlug: z.string().trim().min(1, "Choose a workspace URL.").max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens."),
  email,
  password,
});

export const workspaceSchema = signUpSchema.pick({ workspaceName: true, workspaceSlug: true });
export const passwordResetRequestSchema = z.object({ email });
export const updatePasswordSchema = z.object({
  password,
  confirmPassword: password,
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type AuthActionState = {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
};

export function firstValidationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const url = new URL(value, "http://local.invalid");
    return url.origin === "http://local.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
