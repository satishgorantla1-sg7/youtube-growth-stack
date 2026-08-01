import { describe, expect, it } from "vitest";
import { passwordResetRequestSchema, safeNextPath, signInSchema, signUpSchema, updatePasswordSchema } from "./validation";

describe("auth validation", () => {
  it("accepts valid sign-up details", () => {
    expect(signUpSchema.safeParse({
      displayName: "A Creator",
      workspaceName: "Creator Lab",
      workspaceSlug: "creator-lab",
      email: "creator@example.com",
      password: "correct horse battery staple",
    }).success).toBe(true);
  });

  it.each([
    ["short password", { email: "creator@example.com", password: "short" }],
    ["invalid email", { email: "not-an-email", password: "long-enough" }],
  ])("rejects %s", (_label, input) => {
    expect(signInSchema.safeParse(input).success).toBe(false);
  });

  it.each(["Uppercase", "double--hyphen", "starts-", "spaces here"])("rejects unsafe slug %s", (workspaceSlug) => {
    expect(signUpSchema.safeParse({
      displayName: "A Creator",
      workspaceName: "Creator Lab",
      workspaceSlug,
      email: "creator@example.com",
      password: "long-enough",
    }).success).toBe(false);
  });
});

describe("password recovery validation", () => {
  it("accepts a valid recovery email", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "creator@example.com" }).success).toBe(true);
  });

  it("requires matching strong-enough passwords", () => {
    expect(updatePasswordSchema.safeParse({ password: "new secure password", confirmPassword: "new secure password" }).success).toBe(true);
    expect(updatePasswordSchema.safeParse({ password: "new secure password", confirmPassword: "different password" }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("preserves local paths", () => expect(safeNextPath("/onboarding?step=workspace")).toBe("/onboarding?step=workspace"));
  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)"])("blocks redirect %s", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
