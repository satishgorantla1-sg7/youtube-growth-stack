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
    state: RecordingState = "inactive";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    start() {
      this.state = "recording";
      this.ondataavailable?.({ data: new Blob(["voice"]) } as BlobEvent);
    }

    stop() {
      this.state = "inactive";
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
      return {
        ok: true,
        status: 201,
        json: async () => ({
          runId: "33333333-3333-4333-8333-333333333333",
          approvalId: "11111111-1111-4111-8111-111111111111",
          state: "awaiting_approval",
          message: "Review this bounded research plan.",
          plan: { maxSources: 10, estimatedCredits: 4 },
        }),
      } as Response;
    }
    if (url === "/api/approvals") {
      const body = JSON.parse(String(init?.body)) as { decision: "approved" | "rejected" };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          runId: "33333333-3333-4333-8333-333333333333",
          state: body.decision === "approved" ? "queued" : "cancelled",
          execution: { state: "idle", missing: [] },
        }),
      } as Response;
    }
    if (url === "/api/research/33333333-3333-4333-8333-333333333333") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          state: "completed",
          execution: { state: "idle", missing: [] },
          sources: [
            { provider: "apify", type: "youtube", title: "YouTube evidence", url: "https://youtube.com/watch?v=123", capturedAt: new Date().toISOString() },
            { provider: "firecrawl", type: "web", title: "Web evidence", url: "https://example.com/evidence", capturedAt: new Date().toISOString() },
          ],
        }),
      } as Response;
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
    expect(await screen.findByRole("region", { name: /research approval for edited voice request/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve and queue/i })).toBeEnabled();
  });

  it("uses the recorder format and shows an actionable server transcription error", async () => {
    class SafariRecorderMock {
      mimeType = "audio/mp4;codecs=mp4a.40.2";
      state: RecordingState = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["voice"]) } as BlobEvent);
      }
      stop() {
        this.state = "inactive";
        this.onstop?.(new Event("stop"));
      }
    }
    vi.stubGlobal("MediaRecorder", SafariRecorderMock);
    setMicrophone();
    let uploadedName = "";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/voice/transcribe") {
        uploadedName = ((init?.body as FormData).get("audio") as File).name;
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Voice transcription is temporarily unavailable. Keep typing or try again." }),
        } as Response;
      }
      return { ok: true, status: 204 } as Response;
    }));
    render(<GrowthWorkspace />);

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByRole("button", { name: /stop recording/i });
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    expect(await screen.findByText("Voice transcription is temporarily unavailable. Keep typing or try again.")).toBeInTheDocument();
    expect(uploadedName).toBe("voice.m4a");
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


describe("GrowthWorkspace reply speech", () => {
  it("never speaks automatically and lets the user start and interrupt a reply", async () => {
    setMicrophone();
    const fetchMock = mockVoiceFetch();
    const cancel = vi.fn();
    const speak = vi.fn((utterance: { onstart?: () => void }) => utterance.onstart?.());
    class SpeechSynthesisUtteranceMock {
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal("speechSynthesis", { cancel, speak });
    vi.stubGlobal("SpeechSynthesisUtterance", SpeechSynthesisUtteranceMock);
    render(<GrowthWorkspace />);

    const composer = screen.getByLabelText(/message your growth agent/i);
    fireEvent.change(composer, { target: { value: "Find voice workflow ideas" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    await screen.findByRole("region", { name: /research approval for find voice workflow ideas/i });

    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/voice/speech")).toBe(false);
    expect(speak).not.toHaveBeenCalled();

    const listenButtons = screen.getAllByRole("button", { name: "Listen to reply" });
    fireEvent.click(listenButtons.at(-1)!);
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Playing the agent reply. You can stop it at any time.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop spoken reply" }));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByText("Reply stopped.")).toBeInTheDocument();
  });

  it("cancels a spoken reply while the audio request is still pending", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }));
    render(<GrowthWorkspace />);

    fireEvent.click(screen.getAllByRole("button", { name: "Listen to reply" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel spoken reply" }));

    expect(requestSignal?.aborted).toBe(true);
    expect(screen.getByText("Reply stopped.")).toBeInTheDocument();
  });
  it("releases generated audio URLs when playback is interrupted", async () => {
    const createObjectURL = vi.fn(() => "blob:reply-audio");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    class AudioMock {
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      pause = vi.fn();
      removeAttribute = vi.fn();
      async play() { this.onplay?.(); }
    }
    vi.stubGlobal("Audio", AudioMock);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["spoken reply"], { type: "audio/mpeg" }),
    } as Response)));
    render(<GrowthWorkspace />);

    fireEvent.click(screen.getAllByRole("button", { name: "Listen to reply" })[0]);
    await screen.findByRole("button", { name: "Stop spoken reply" });
    fireEvent.click(screen.getByRole("button", { name: "Stop spoken reply" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:reply-audio");
  });

  it("shows a readable fallback when spoken playback is unavailable", async () => {
    mockVoiceFetch();
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    render(<GrowthWorkspace />);

    fireEvent.click(screen.getAllByRole("button", { name: "Listen to reply" })[0]);

    expect(await screen.findByText("Audio playback is unavailable in this browser. You can still read the reply.")).toBeInTheDocument();
    expect(screen.getByText(/Welcome, Creator/)).toBeInTheDocument();
  });

  it("stops microphone tracks when the workspace unmounts during recording", async () => {
    const stopTrack = vi.fn();
    setMicrophone(vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }));
    mockVoiceFetch();
    const view = render(<GrowthWorkspace />);

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByRole("button", { name: /stop recording/i });
    view.unmount();

    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
});
describe("GrowthWorkspace readiness", () => {
  it("fails closed across text, voice, and suggestions when the server gate is closed", () => {
    const getUserMedia = setMicrophone();
    const fetchMock = mockVoiceFetch();
    const view = render(<GrowthWorkspace researchEnabled />);

    const composer = screen.getByLabelText(/message your growth agent/i);
    const consent = screen.getByLabelText(/I consent to this recording/i);
    fireEvent.change(composer, { target: { value: "Stored prompt" } });
    fireEvent.click(consent);
    view.rerender(<GrowthWorkspace researchEnabled={false} />);

    const microphone = screen.getByRole("button", { name: /start recording/i });
    const suggestions = [
      screen.getByRole("button", { name: "Find content gaps" }),
      screen.getByRole("button", { name: "Analyse competitors" }),
      screen.getByRole("button", { name: "Build a video package" }),
    ];

    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message to growth agent" })).toBeDisabled();
    expect(consent).toBeDisabled();
    expect(microphone).toBeDisabled();
    suggestions.forEach((suggestion) => expect(suggestion).toBeDisabled());

    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.click(consent);
    fireEvent.click(microphone);
    suggestions.forEach((suggestion) => fireEvent.click(suggestion));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops an active microphone without transcription when the server gate closes", async () => {
    const stopTrack = vi.fn();
    setMicrophone(vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }));
    const fetchMock = mockVoiceFetch();
    const view = render(<GrowthWorkspace researchEnabled />);

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByRole("button", { name: /stop recording/i });
    fetchMock.mockClear();

    view.rerender(<GrowthWorkspace researchEnabled={false} />);

    await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /start recording/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit an already-transcribed voice prompt after the server gate closes", async () => {
    setMicrophone();
    const fetchMock = mockVoiceFetch();
    const view = render(<GrowthWorkspace researchEnabled />);

    fireEvent.click(screen.getByLabelText(/I consent to this recording/i));
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    fireEvent.click(await screen.findByRole("button", { name: /stop recording/i }));
    const transcript = await screen.findByLabelText(/review voice transcript/i);
    const confirm = screen.getByRole("button", { name: /send transcript to agent/i });

    fetchMock.mockClear();
    view.rerender(<GrowthWorkspace researchEnabled={false} />);

    expect(transcript).toBeDisabled();
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe("GrowthWorkspace research approvals", () => {
  it("shows a bounded approval plan for typed input and only queues after approval", async () => {
    const fetchMock = mockVoiceFetch();
    render(<GrowthWorkspace workspaceId="22222222-2222-4222-8222-222222222222" />);

    const composer = screen.getByLabelText(/message your growth agent/i);
    fireEvent.change(composer, { target: { value: "Find three ideas about AI productivity" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    const approval = await screen.findByRole("region", { name: /research approval for find three ideas about ai productivity/i });
    expect(approval).toHaveTextContent("10 sources");
    expect(approval).toHaveTextContent("4 credits");
    expect(approval).toHaveTextContent("Nothing is queued until you approve it.");

    const researchCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/research");
    const researchRequest = JSON.parse(String(researchCall?.[1]?.body)) as { workspaceId?: string };
    expect(researchRequest.workspaceId).toBe("22222222-2222-4222-8222-222222222222");
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/approvals")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /approve and queue/i }));

    expect(await screen.findByText("Research complete. 2 evidence sources saved.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YouTube evidence" })).toHaveAttribute("href", "https://youtube.com/watch?v=123");
    const approvalCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/approvals");
    expect(JSON.parse(String(approvalCall?.[1]?.body))).toEqual({
      approvalId: "11111111-1111-4111-8111-111111111111",
      decision: "approved",
    });
    expect(screen.queryByRole("button", { name: /approve and queue/i })).not.toBeInTheDocument();
  });

  it("records rejection without queueing research", async () => {
    mockVoiceFetch();
    render(<GrowthWorkspace />);

    const composer = screen.getByLabelText(/message your growth agent/i);
    fireEvent.change(composer, { target: { value: "Analyse this competitor" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Rejected. No research was queued and no credits were used.")).toBeInTheDocument();
  });

  it("keeps the decision controls available after an approval request fails", async () => {
    const fetchMock = mockVoiceFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/research") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            runId: "33333333-3333-4333-8333-333333333333",
            approvalId: "11111111-1111-4111-8111-111111111111",
            state: "awaiting_approval",
            message: "Review this bounded research plan.",
            plan: { maxSources: 10, estimatedCredits: 4 },
          }),
        } as Response;
      }
      if (url === "/api/approvals") {
        return { ok: false, status: 409, json: async () => ({ error: "approval_transition_failed" }) } as Response;
      }
      return { ok: true, status: 204 } as Response;
    });

    render(<GrowthWorkspace />);
    const composer = screen.getByLabelText(/message your growth agent/i);
    fireEvent.change(composer, { target: { value: "Find content gaps" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.click(await screen.findByRole("button", { name: /approve and queue/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("I couldn’t save your decision. Please try again.");
    expect(screen.getByRole("button", { name: /approve and queue/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });
});
