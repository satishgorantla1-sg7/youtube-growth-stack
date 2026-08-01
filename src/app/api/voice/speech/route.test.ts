import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ serverEnv: vi.fn() }));
vi.mock("@/lib/voice/access", () => ({ authorizeVoiceRequest: vi.fn() }));

import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";
import { POST } from "./route";

const mockedEnv = vi.mocked(serverEnv);
const mockedAccess = vi.mocked(authorizeVoiceRequest);

function speechRequest(text = "Here are your three ideas") {
  return new Request("http://localhost/api/voice/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

describe("POST /api/voice/speech", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("explicitly signals the browser fallback in demo mode", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(speechRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "voice_speech_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an actionable error when the server key is missing", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_SPEECH_MODEL: "tts-1", OPENAI_VOICE: "marin" } as never);

    const response = await POST(speechRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "voice_speech_not_configured",
      message: expect.stringContaining("OPENAI_API_KEY"),
    });
  });

  it("generates speech through OpenAI without exposing the server key", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_API_KEY: "server-secret", OPENAI_SPEECH_MODEL: "tts-1", OPENAI_VOICE: "marin" } as never);
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(speechRequest("Speak this"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Authorization")).toBeNull();
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(init.headers).toMatchObject({ Authorization: "Bearer server-secret" });
    expect(JSON.parse(String(init.body))).toEqual({ model: "tts-1", voice: "marin", input: "Speak this" });
  });
});
