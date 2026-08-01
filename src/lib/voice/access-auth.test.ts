import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isDemoMode: vi.fn(), hasSupabaseConfig: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { hasSupabaseConfig, isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { authorizeVoiceRequest, resetVoiceRateLimitsForTests } from "./access";

const mockedDemoMode = vi.mocked(isDemoMode);
const mockedSupabaseConfig = vi.mocked(hasSupabaseConfig);
const mockedCreateClient = vi.mocked(createClient);

function clientFor(userId?: string, workspaceId?: string) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: workspaceId ? { workspace_id: workspaceId } : null,
    error: null,
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error("missing session"),
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) })),
      })),
    })),
  };
}

describe("voice authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVoiceRateLimitsForTests();
    mockedDemoMode.mockReturnValue(false);
    mockedSupabaseConfig.mockReturnValue(true);
  });

  it("keeps demo mode provider-free without opening Supabase", async () => {
    mockedDemoMode.mockReturnValue(true);
    expect(await authorizeVoiceRequest("transcribe")).toEqual({ allowed: true, demo: true });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("rejects an anonymous production request", async () => {
    mockedCreateClient.mockResolvedValue(clientFor() as never);
    const access = await authorizeVoiceRequest("speech");
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.response.status).toBe(401);
  });

  it("requires workspace membership", async () => {
    mockedCreateClient.mockResolvedValue(clientFor("user-1") as never);
    const access = await authorizeVoiceRequest("speech");
    expect(access.allowed).toBe(false);
    if (!access.allowed) expect(access.response.status).toBe(403);
  });

  it("authorizes and rate-limits a workspace member", async () => {
    mockedCreateClient.mockResolvedValue(clientFor("user-1", "workspace-1") as never);
    for (let index = 0; index < 5; index += 1) {
      expect((await authorizeVoiceRequest("realtime")).allowed).toBe(true);
    }
    const blocked = await authorizeVoiceRequest("realtime");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("Retry-After")).toBeTruthy();
    }
  });
});
