import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), ensureWorkspace: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/workspace", () => ({ ensureWorkspace: mocks.ensureWorkspace }));

import { GET } from "./route";

describe("auth callback recovery routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a valid recovery session to the password update page", async () => {
    mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({
      error: null,
      data: { user: { user_metadata: {} } },
    }) } });

    const response = await GET(new NextRequest("https://app.example/auth/callback?code=valid&next=%2Fauth%2Fupdate-password"));

    expect(response.headers.get("location")).toBe("https://app.example/auth/update-password");
    expect(mocks.ensureWorkspace).not.toHaveBeenCalled();
  });

  it("does not honor an external recovery redirect", async () => {
    mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({
      error: null,
      data: { user: { user_metadata: {} } },
    }) } });
    mocks.ensureWorkspace.mockResolvedValue({ workspaceId: "workspace-1" });

    const response = await GET(new NextRequest("https://app.example/auth/callback?code=valid&next=https%3A%2F%2Fevil.example"));

    expect(response.headers.get("location")).toBe("https://app.example/onboarding?stage=channel");
  });
});
