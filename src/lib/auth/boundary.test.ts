import { describe, expect, it } from "vitest";
import { authRedirect, isProtectedAppPath, onboardingConfigRedirect } from "./boundary";

describe("auth route boundary", () => {
  it("keeps demo mode open without Supabase", () => {
    expect(authRedirect({ configured: false, authenticated: false, pathname: "/", search: "" })).toBeNull();
  });

  it("returns demo onboarding to the runnable workspace before a client is created", () => {
    expect(onboardingConfigRedirect(false)).toBe("/");
    expect(onboardingConfigRedirect(true)).toBeNull();
  });

  it("sends anonymous connected-mode users to sign in with their destination", () => {
    expect(authRedirect({ configured: true, authenticated: false, pathname: "/onboarding", search: "?step=workspace" }))
      .toBe("/auth/sign-in?next=%2Fonboarding%3Fstep%3Dworkspace");
  });

  it("keeps callbacks and API routes public", () => {
    expect(isProtectedAppPath("/auth/callback")).toBe(false);
    expect(isProtectedAppPath("/api/health")).toBe(false);
  });

  it("moves an authenticated user away from auth entry pages", () => {
    expect(authRedirect({ configured: true, authenticated: true, pathname: "/auth/sign-in", search: "" })).toBe("/");
  });
});
