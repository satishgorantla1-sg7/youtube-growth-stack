import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrowthWorkspace } from "./growth-workspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

beforeEach(() => {
  class MediaRecorderMock {
    mimeType = "audio/webm";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    start() {
      this.ondataavailable?.({ data: new Blob(["voice"]) } as BlobEvent);
    }

    stop() {
      this.onstop?.(new Event("stop"));
    }
  }

  vi.stubGlobal("MediaRecorder", MediaRecorderMock);
});

function setMicrophone(getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  return getUserMedia;
}

function mockVoiceFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url === "/api/voice/transcribe") {
      return { ok: true, status: 200, json: async () => ({ text: "Draft voice request" }) } as Response;
    }
    if (url === "/api/research") {
      return { ok: true, status: 200, json: async () => ({ message: "Research queued" }) } as Response;
    }
    return { ok: true, status: 204 } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GrowthWorkspace voice consent", () => {
  it("requires explicit upload consent before requesting microphone access", async () => {
    const getUserMedia = setMicrophone();
    mockVoiceFetch();
    render(<GrowthWorkspace />);

    expect(screen.getByText(/uploaded to OpenAI for transcription/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeDisabled();
    expect(getUserMedia).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
  });

  it("lets the user edit a transcript and only submits after confirmation", async () => {
    setMicrophone();
    const fetchMock = mockVoiceFetch();
    render(<GrowthWorkspace />);

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /stop recording/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    const transcript = await screen.findByLabelText(/review voice transcript/i);
    expect(transcript).toHaveValue("Draft voice request");
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/research")).toBe(false);

    fireEvent.change(transcript, { target: { value: "Edited voice request" } });
    fireEvent.click(screen.getByRole("button", { name: /send transcript to agent/i }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/research")).toBe(true));
    const researchCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/research");
    const request = JSON.parse(String(researchCall?.[1]?.body)) as { prompt: string };
    expect(request.prompt).toBe("Edited voice request");
  });

  it("preserves the text path when microphone permission is denied", async () => {
    setMicrophone(vi.fn().mockRejectedValue(new Error("denied")));
    const fetchMock = mockVoiceFetch();
    render(<GrowthWorkspace />);

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    expect(await screen.findByText("Microphone access is blocked. Enable it in your browser settings or keep typing.")).toBeInTheDocument();

    const composer = screen.getByLabelText(/message your growth agent/i);
    fireEvent.change(composer, { target: { value: "Use the text fallback" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/research")).toBe(true));
  });
});
