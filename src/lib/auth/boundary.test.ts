import { describe, expect, it } from "vitest";
import { authRedirect, isProtectedAppPath } from "./boundary";

describe("auth route boundary", () => {
  it("keeps demo mode open without Supabase", () => {
    expect(authRedirect({ configured: false, authenticated: false, pathname: "/", search: "" })).toBeNull();
  });

  it("keeps the full demo onboarding route open without Supabase", () => {
    expect(authRedirect({ configured: false, authenticated: false, pathname: "/onboarding", search: "" })).toBeNull();
  });

  it("sends anonymous connected-mode users to sign in with their destination", () => {
    expect(authRedirect({ configured: true, authenticated: false, pathname: "/onboarding", search: "?stage=channel" }))
      .toBe("/auth/sign-in?next=%2Fonboarding%3Fstage%3Dchannel");
  });

  it("does not loop an authenticated user away from staged onboarding", () => {
    expect(authRedirect({ configured: true, authenticated: true, pathname: "/onboarding", search: "?stage=channel" })).toBeNull();
  });

  it("keeps callbacks and API routes public", () => {
    expect(isProtectedAppPath("/auth/callback")).toBe(false);
    expect(isProtectedAppPath("/api/health")).toBe(false);
  });

  it("moves an authenticated user away from auth entry pages", () => {
    expect(authRedirect({ configured: true, authenticated: true, pathname: "/auth/sign-in", search: "" })).toBe("/");
  });
});
