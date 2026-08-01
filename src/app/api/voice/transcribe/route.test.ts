import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ serverEnv: vi.fn() }));
vi.mock("@/lib/voice/access", () => ({ authorizeVoiceRequest: vi.fn() }));

import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";
import { POST } from "./route";

const mockedEnv = vi.mocked(serverEnv);
const mockedAccess = vi.mocked(authorizeVoiceRequest);

function audioRequest(content = "recording") {
  const request = new Request("http://localhost/api/voice/transcribe", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=voice-test" },
  });
  const body = new FormData();
  body.append("audio", new File([content], "voice.webm", { type: "audio/webm" }));
  vi.spyOn(request, "formData").mockResolvedValue(body);
  return request;
}

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("never presents a canned demo transcript as recognized speech", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(audioRequest());
    const result = await response.json();

    expect(response.status).toBe(503);
    expect(result).toMatchObject({
      error: "voice_transcription_unavailable",
      message: expect.stringMatching(/demo mode.*typing/i),
    });
    expect(result).not.toHaveProperty("text");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an actionable error when the server key is missing", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe" } as never);

    const response = await POST(audioRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "voice_transcription_not_configured",
      message: expect.stringContaining("OPENAI_API_KEY"),
    });
  });

  it("sends valid ephemeral audio to the configured OpenAI transcription model", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({
      OPENAI_API_KEY: "server-secret",
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
    } as never);
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: "  Three AI productivity ideas  " }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(audioRequest());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: "Three AI productivity ideas" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer server-secret" });
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("gpt-4o-transcribe");
  });

  it("rejects an empty provider transcript instead of claiming success", async () => {
    mockedAccess.mockResolvedValue({ allowed: true, demo: false, userId: "user-1", workspaceId: "workspace-1" });
    mockedEnv.mockReturnValue({ OPENAI_API_KEY: "server-secret", OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe" } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ text: "  " })));

    const response = await POST(audioRequest());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: "no_speech_detected" });
  });
});
