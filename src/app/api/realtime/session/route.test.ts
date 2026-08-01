import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ serverEnv: vi.fn() }));
vi.mock("@/lib/voice/access", () => ({ authorizeVoiceRequest: vi.fn() }));

import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";
import { POST } from "./route";

const mockedEnv = vi.mocked(serverEnv);
const mockedAccess = vi.mocked(authorizeVoiceRequest);

describe("POST /api/realtime/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not call OpenAI in demo mode", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "realtime_voice_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an actionable error when the server key is missing", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_REALTIME_MODEL: "gpt-realtime", OPENAI_VOICE: "marin" } as never);

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "realtime_voice_not_configured",
      message: expect.stringContaining("OPENAI_API_KEY"),
    });
  });

  it("returns only a short-lived OpenAI client secret to an authorized caller", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_API_KEY: "server-secret", OPENAI_REALTIME_MODEL: "gpt-realtime", OPENAI_VOICE: "marin" } as never);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ value: "ek_short_lived", expires_at: 1_900_000_000 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();
    const result = await response.json();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(result).toEqual({ value: "ek_short_lived", expires_at: 1_900_000_000 });
    expect(JSON.stringify(result)).not.toContain("server-secret");
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init.headers).toMatchObject({ Authorization: "Bearer server-secret" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      session: { type: "realtime", model: "gpt-realtime", audio: { output: { voice: "marin" } } },
    });
  });

  it("rejects an invalid provider response", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_API_KEY: "server-secret", OPENAI_REALTIME_MODEL: "gpt-realtime", OPENAI_VOICE: "marin" } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ expires_at: 1_900_000_000 })));

    const response = await POST();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: "realtime_session_invalid" });
  });
});
