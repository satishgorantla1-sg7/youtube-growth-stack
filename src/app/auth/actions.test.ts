import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/workspace", () => ({ ensureWorkspace: vi.fn() }));

import { requestPasswordReset, updatePassword } from "./actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("password recovery actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://youtube-growth-stack-one.vercel.app");
  });

  it("returns the same non-enumerating response when reset delivery reports an error", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: new Error("user missing") });
    mocks.createClient.mockResolvedValue({ auth: { resetPasswordForEmail } });

    const result = await requestPasswordReset({}, form({ email: "creator@example.com" }));

    expect(result.message).toMatch(/If an account exists/i);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("creator@example.com", {
      redirectTo: "https://youtube-growth-stack-one.vercel.app/auth/callback?next=%2Fauth%2Fupdate-password",
    });
  });

  it("rejects mismatched passwords before touching Supabase", async () => {
    const result = await updatePassword({}, form({ password: "one secure password", confirmPassword: "another secure password" }));
    expect(result).toEqual({ error: "Passwords do not match." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires a valid recovery session", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const result = await updatePassword({}, form({ password: "new secure password", confirmPassword: "new secure password" }));
    expect(result.error).toMatch(/expired/i);
  });

  it("updates the authenticated user and returns to the workspace", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      updateUser,
    } });

    await updatePassword({}, form({ password: "new secure password", confirmPassword: "new secure password" }));

    expect(updateUser).toHaveBeenCalledWith({ password: "new secure password" });
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
