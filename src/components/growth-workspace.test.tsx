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
      return {
        ok: true,
        status: 201,
        json: async () => ({
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
        json: async () => ({ state: body.decision === "approved" ? "queued" : "cancelled" }),
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

    expect(await screen.findByText("Approved. Research is queued.")).toBeInTheDocument();
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
