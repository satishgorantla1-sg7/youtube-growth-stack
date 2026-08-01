import { describe, expect, it } from "vitest";
import { safeNextPath, signInSchema, signUpSchema } from "./validation";

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

describe("safeNextPath", () => {
  it("preserves local paths", () => expect(safeNextPath("/onboarding?step=workspace")).toBe("/onboarding?step=workspace"));
  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)"])("blocks redirect %s", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
