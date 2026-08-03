"use client";

import {
  AudioLines,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Lightbulb,
  LoaderCircle,
  Mic,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Target,
  Volume2,
  VolumeX,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceEmptyState, WorkspaceShell } from "./workspace";
import type { WorkspaceNavigationCounts, WorkspaceReadiness, WorkspaceUsageSummary } from "./workspace";

type ApprovalState = "pending" | "submitting" | "queued" | "configuration_required" | "running" | "completed" | "failed" | "cancelled" | "error";

type ResearchEvidence = {
  provider: "apify" | "firecrawl" | "demo";
  type: "youtube" | "web";
  title: string;
  url: string;
  capturedAt: string;
};

type ResearchApproval = {
  approvalId: string;
  runId: string;
  prompt: string;
  maxSources: number;
  estimatedCredits: number;
  status: ApprovalState;
  sources?: ResearchEvidence[];
  error?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  approval?: ResearchApproval;
};

type VoiceStatus = "idle" | "listening" | "processing" | "review" | "speaking" | "interrupted" | "error";

function recordingFilename(mimeType: string) {
  const normalized = mimeType.split(";", 1)[0].toLowerCase();
  const extension = normalized === "audio/mp4" || normalized === "audio/x-m4a"
    ? "m4a"
    : normalized === "audio/ogg"
      ? "ogg"
      : normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav"
        ? "wav"
        : normalized === "audio/mpeg"
          ? "mp3"
          : "webm";
  return `voice.${extension}`;
}

type ResearchResponse = {
  runId?: string;
  approvalId?: string;
  state?: string;
  message?: string;
  error?: string;
  plan?: {
    maxSources?: number;
    estimatedCredits?: number;
  };
};

type ApprovalResponse = {
  runId?: string;
  state?: "queued" | "cancelled";
  execution?: {
    state?: "configuration_required" | "idle";
    missing?: Array<"activation" | "apify" | "firecrawl" | "worker">;
  };
  error?: string;
};

type ResearchStatusResponse = {
  state?: "queued" | "running" | "completed" | "failed" | "cancelled";
  errorCode?: string | null;
  execution?: {
    state?: "configuration_required" | "idle" | "completed" | "queued" | "dead_letter";
    missing?: Array<"activation" | "apify" | "firecrawl" | "worker">;
  };
  sources?: ResearchEvidence[];
  error?: string;
};

function starterMessages(displayName: string): Message[] {
  return [{
    id: "welcome",
    role: "assistant",
    text: `Welcome, ${displayName}. Tell me what you want to research, or use voice to describe the next video you want to make.`,
  }];
}

export type DashboardIdeaSummary = {
  id: string;
  title: string;
  score: number | null;
  signal: string | null;
};

export type DashboardApprovalSummary = {
  id: string;
  title: string;
  kind: "research" | "content_package" | "other";
  summary: string | null;
};

export type GrowthWorkspaceDashboard = {
  channel: { name: string; status: "connected" | "syncing" | "needs_attention" } | null;
  ideas: DashboardIdeaSummary[];
  approvals: DashboardApprovalSummary[];
  activity: { sourcesAnalysed: number; packagesGenerated: number; bestSignal: string | null } | null;
};

export type GrowthWorkspaceProps = {
  displayName?: string;
  workspaceName?: string;
  workspaceId?: string;
  signOutAction?: () => Promise<void>;
  dashboard?: GrowthWorkspaceDashboard | null;
  usage?: WorkspaceUsageSummary | null;
  readiness?: WorkspaceReadiness;
  navigationCounts?: WorkspaceNavigationCounts;
  mode?: "demo" | "connected";
  researchEnabled?: boolean;
};

export function GrowthWorkspace({
  displayName = "Creator",
  workspaceName = "Creator workspace",
  workspaceId,
  signOutAction,
  dashboard = null,
  usage = null,
  readiness,
  navigationCounts,
  mode = "connected",
  researchEnabled = true,
}: GrowthWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>(() => starterMessages(displayName));
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const replyAudio = useRef<HTMLAudioElement | null>(null);
  const speechRequest = useRef<AbortController | null>(null);
  const replyAudioUrl = useRef<string | null>(null);
  const pollingRequests = useRef(new Set<AbortController>());
  const mounted = useRef(true);

  const releaseReplyAudio = useCallback(() => {
    if (replyAudio.current) {
      replyAudio.current.pause();
      replyAudio.current.removeAttribute("src");
      replyAudio.current = null;
    }
    if (replyAudioUrl.current) {
      URL.revokeObjectURL(replyAudioUrl.current);
      replyAudioUrl.current = null;
    }
  }, []);

  const stopReply = useCallback((showInterrupted = true) => {
    speechRequest.current?.abort();
    speechRequest.current = null;
    releaseReplyAudio();
    if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
    if (showInterrupted) {
      setVoiceStatus("interrupted");
      setVoiceError("");
    }
  }, [releaseReplyAudio]);

  const speakWithBrowser = useCallback((text: string) => {
    if (typeof window.speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeakingMessageId(null);
      setVoiceStatus("error");
      setVoiceError("Audio playback is unavailable in this browser. You can still read the reply.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => mounted.current && setVoiceStatus("speaking");
    utterance.onend = () => {
      if (!mounted.current) return;
      setSpeakingMessageId(null);
      setVoiceStatus("idle");
    };
    utterance.onerror = () => {
      if (!mounted.current) return;
      setSpeakingMessageId(null);
      setVoiceStatus("error");
      setVoiceError("I couldn’t play that reply. You can still read it or try again.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback(async (messageId: string, text: string) => {
    stopReply(false);
    setVoiceError("");
    setSpeakingMessageId(messageId);
    setVoiceStatus("processing");
    const request = new AbortController();
    speechRequest.current = request;
    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      speechRequest.current = null;
      if (!response.ok || response.status === 204) {
        speakWithBrowser(text);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      replyAudioUrl.current = url;
      replyAudio.current = audio;
      audio.onplay = () => mounted.current && setVoiceStatus("speaking");
      audio.onended = () => {
        releaseReplyAudio();
        if (mounted.current) {
          setSpeakingMessageId(null);
          setVoiceStatus("idle");
        }
      };
      audio.onerror = () => {
        releaseReplyAudio();
        if (mounted.current) speakWithBrowser(text);
      };
      await audio.play();
    } catch {
      if (request.signal.aborted) return;
      speechRequest.current = null;
      releaseReplyAudio();
      if (mounted.current) speakWithBrowser(text);
    }
  }, [releaseReplyAudio, speakWithBrowser, stopReply]);

  useEffect(() => {
    mounted.current = true;
    const activePollingRequests = pollingRequests.current;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      microphoneStream.current?.getTracks().forEach((track) => track.stop());
      microphoneStream.current = null;
      speechRequest.current?.abort();
      speechRequest.current = null;
      activePollingRequests.forEach((request) => request.abort());
      activePollingRequests.clear();
      releaseReplyAudio();
      if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel();
    };
  }, [releaseReplyAudio]);

  useEffect(() => {
    if (researchEnabled || recorder.current?.state !== "recording") return;
    recorder.current.onstop = null;
    recorder.current.stop();
    recorder.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
    chunks.current = [];
    setVoiceStatus("idle");
  }, [researchEnabled]);

  const submitPrompt = useCallback(async (value: string) => {
    if (!researchEnabled) return;
    const clean = value.trim();
    if (!clean || isThinking) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);
    setPrompt("");
    setIsThinking(true);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean, workspaceId, mode: "quick", sources: ["youtube", "web"], idempotencyKey: crypto.randomUUID() }),
      });
      const result = (await response.json()) as ResearchResponse;
      if (!response.ok) throw new Error(result.error ?? "research_run_failed");
      const reply = result.message ?? "I queued the research. I’ll bring the evidence and draft to your approval queue.";
      const approval = result.state === "awaiting_approval" && result.approvalId && result.runId ? {
        approvalId: result.approvalId,
        runId: result.runId,
        prompt: clean,
        maxSources: result.plan?.maxSources ?? 10,
        estimatedCredits: result.plan?.estimatedCredits ?? 0,
        status: "pending" as const,
      } : undefined;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: reply, approval }]);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: "I couldn’t prepare that research plan. Check your connection and try again." },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, researchEnabled, workspaceId]);

  const pollResearchRun = useCallback(async (messageId: string, runId: string) => {
    const request = new AbortController();
    pollingRequests.current.add(request);
    try {
      for (let attempt = 0; attempt < 48; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2_500));
        if (request.signal.aborted || !mounted.current) return;
        const response = await fetch(`/api/research/${encodeURIComponent(runId)}`, { signal: request.signal, cache: "no-store" });
        const result = (await response.json()) as ResearchStatusResponse;
        if (!response.ok || !result.state) throw new Error(result.error ?? "research_status_unavailable");
        const nextStatus: ApprovalState = result.state === "queued" && result.execution?.state === "configuration_required"
          ? "configuration_required"
          : result.state;
        setMessages((current) => current.map((message) => message.id === messageId && message.approval
          ? {
              ...message,
              approval: {
                ...message.approval,
                status: nextStatus,
                sources: result.sources ?? message.approval.sources,
                error: result.state === "failed" ? "The research worker stopped after a provider error. No further credits will be used." : undefined,
              },
            }
          : message));
        if (["completed", "failed", "cancelled"].includes(result.state)) return;
      }
      throw new Error("research_status_timeout");
    } catch (error) {
      if (request.signal.aborted || !mounted.current) return;
      setMessages((current) => current.map((message) => message.id === messageId && message.approval
        ? { ...message, approval: { ...message.approval, status: "error", error: error instanceof Error && error.message === "research_status_timeout"
          ? "Research is still queued. Refresh later to check its progress."
          : "I couldn’t refresh the research status. The queued job is still safely stored." } }
        : message));
    } finally {
      pollingRequests.current.delete(request);
    }
  }, []);

  const decideApproval = useCallback(async (messageId: string, approvalId: string, decision: "approved" | "rejected") => {
    setMessages((current) => current.map((message) => message.id === messageId && message.approval
      ? { ...message, approval: { ...message.approval, status: "submitting", error: undefined } }
      : message));
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision }),
      });
      const result = (await response.json()) as ApprovalResponse;
      if (!response.ok || !result.state) throw new Error(result.error ?? "approval_transition_failed");
      const nextStatus: ApprovalState = result.state === "queued" && result.execution?.state === "configuration_required"
        ? "configuration_required"
        : result.state === "queued" ? "queued" : "cancelled";
      setMessages((current) => current.map((message) => message.id === messageId && message.approval
        ? { ...message, approval: { ...message.approval, status: nextStatus, error: undefined } }
        : message));
      if (result.state === "queued" && result.runId) void pollResearchRun(messageId, result.runId);
    } catch {
      setMessages((current) => current.map((message) => message.id === messageId && message.approval
        ? { ...message, approval: { ...message.approval, status: "error", error: "I couldn’t save your decision. Please try again." } }
        : message));
    }
  }, [pollResearchRun]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPrompt(prompt);
  }

  async function toggleRecording() {
    if (!researchEnabled) return;
    if (voiceStatus === "listening" && recorder.current) {
      setVoiceStatus("processing");
      recorder.current.stop();
      return;
    }
    if (!voiceConsent || voiceStatus === "processing" || voiceStatus === "review") return;
    if (voiceStatus === "speaking") stopReply(false);
    try {
      setVoiceError("");
      setVoiceStatus("idle");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStream.current = stream;
      const nextRecorder = new MediaRecorder(stream);
      chunks.current = [];
      nextRecorder.ondataavailable = (event) => chunks.current.push(event.data);
      nextRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        microphoneStream.current = null;
        recorder.current = null;
        try {
          const audio = new Blob(chunks.current, { type: nextRecorder.mimeType });
          chunks.current = [];
          if (!audio.size) throw new Error("No audio was recorded.");
          const body = new FormData();
          body.append("audio", audio, recordingFilename(nextRecorder.mimeType));
          const response = await fetch("/api/voice/transcribe", { method: "POST", body });
          const result = (await response.json().catch(() => ({}))) as { text?: string; message?: string; error?: string };
          if (!response.ok) {
            throw new Error(result.message ?? result.error ?? "Transcription failed. Check your connection or keep typing.");
          }
          const transcript = result.text?.trim();
          if (!transcript) throw new Error("No speech was detected. Try again closer to the microphone or keep typing.");
          if (!mounted.current) return;
          setVoiceTranscript(transcript);
          setVoiceStatus("review");
        } catch (error) {
          if (!mounted.current) return;
          setVoiceError(error instanceof Error ? error.message : "I couldn’t transcribe that recording. Please try again or keep typing.");
          setSpeakingMessageId(null);
          setVoiceStatus("error");
        }
      };
      recorder.current = nextRecorder;
      nextRecorder.start();
      setVoiceStatus("listening");
    } catch {
      setSpeakingMessageId(null);
      setVoiceStatus("error");
      setVoiceError("Microphone access is blocked. Enable it in your browser settings or keep typing.");
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Microphone access is blocked. You can enable it in your browser settings or keep typing here.",
      }]);
    }
  }

  async function confirmVoiceTranscript() {
    const transcript = voiceTranscript.trim();
    if (!researchEnabled || !transcript || isThinking) return;
    setVoiceTranscript("");
    setVoiceStatus("idle");
    await submitPrompt(transcript);
  }

  return (
    <WorkspaceShell
      activePath="/"
      title="Command centre"
      description="Voice-first research and planning"
      displayName={displayName}
      workspaceName={workspaceName}
      signOutAction={signOutAction}
      usage={usage}
      readiness={readiness}
      navigationCounts={navigationCounts}
      mode={mode}
    >
        <div className="content">
          <section className="hero-copy">
            <div>
              <p className="eyebrow"><Flame size={15} fill="currentColor" /> Ready when you are</p>
              <h1>What should we grow today?</h1>
              <p>Talk naturally. Your research agent will investigate, build, and bring every important decision back to you.</p>
            </div>
            {dashboard?.channel ? (
              <div className="connected-channel">
                <span className="channel-avatar"><Youtube size={21} fill="currentColor" /></span>
                <span><small>Connected channel</small><strong>{dashboard.channel.name}</strong></span>
                <i>{dashboard.channel.status === "connected" ? "Connected" : dashboard.channel.status === "syncing" ? "Syncing" : "Check connection"}</i>
              </div>
            ) : (
              <div className="connected-channel channel-empty">
                <span className="channel-avatar"><Youtube size={21} /></span>
                <span><small>YouTube channel</small><strong>No channel connected</strong></span>
                <Link href="/settings">Connection settings</Link>
              </div>
            )}
          </section>

          <section className="command-card">
            <div className="conversation" aria-live="polite">
              {messages.map((message) => (
                <div className={`message ${message.role}`} key={message.id}>
                  <span className="message-avatar">{message.role === "assistant" ? <Sparkles size={17} /> : "SG"}</span>
                  <div>
                    <small>{message.role === "assistant" ? "Growth agent" : "You"}</small>
                    <p>{message.text}</p>
                    {message.role === "assistant" ? (
                      <button
                        className="reply-audio-button"
                        type="button"
                        onClick={() => speakingMessageId === message.id && (voiceStatus === "processing" || voiceStatus === "speaking") ? stopReply() : void speak(message.id, message.text)}
                        aria-label={speakingMessageId === message.id && (voiceStatus === "processing" || voiceStatus === "speaking") ? voiceStatus === "processing" ? "Cancel spoken reply" : "Stop spoken reply" : "Listen to reply"}
                      >
                        {speakingMessageId === message.id && (voiceStatus === "processing" || voiceStatus === "speaking") ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        {speakingMessageId === message.id && (voiceStatus === "processing" || voiceStatus === "speaking") ? voiceStatus === "processing" ? "Cancel reply" : "Stop reply" : "Listen to reply"}
                      </button>
                    ) : null}
                    {message.approval ? (
                      <section className="conversation-approval" aria-label={`Research approval for ${message.approval.prompt}`}>
                        <div className="conversation-approval-heading">
                          <span><ShieldCheck size={16} /> Human approval required</span>
                          <strong>{message.approval.estimatedCredits} credits</strong>
                        </div>
                        <p>This research will inspect up to {message.approval.maxSources} sources. Nothing is queued until you approve it.</p>
                        {message.approval.status === "pending" || message.approval.status === "error" ? (
                          <div className="conversation-approval-actions">
                            <button
                              type="button"
                              className="approve"
                              onClick={() => void decideApproval(message.id, message.approval!.approvalId, "approved")}
                            >
                              <Check size={15} /> Approve and queue
                            </button>
                            <button
                              type="button"
                              onClick={() => void decideApproval(message.id, message.approval!.approvalId, "rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                        <div className="conversation-approval-status" role="status" aria-live="polite">
                          {message.approval.status === "submitting" ? <><LoaderCircle size={14} /> Saving your decision…</> : null}
                          {message.approval.status === "queued" ? <><LoaderCircle size={14} /> Approved. Starting real research…</> : null}
                          {message.approval.status === "configuration_required" ? <><Clock3 size={14} /> Approved and safely queued. Provider setup must be completed before it can run.</> : null}
                          {message.approval.status === "running" ? <><LoaderCircle size={14} /> Apify and Firecrawl are collecting evidence…</> : null}
                          {message.approval.status === "completed" ? <><Check size={14} /> Research complete. {message.approval.sources?.length ?? 0} evidence sources saved.</> : null}
                          {message.approval.status === "failed" ? "Research stopped safely after a provider error." : null}
                          {message.approval.status === "cancelled" ? "Rejected. No research was queued and no credits were used." : null}
                        </div>
                        {message.approval.status === "completed" && message.approval.sources?.length ? (
                          <ul className="conversation-evidence" aria-label="Research evidence">
                            {message.approval.sources.map((source) => (
                              <li key={`${source.provider}-${source.url}`}>
                                <span>{source.provider === "apify" ? "YouTube · Apify" : source.provider === "firecrawl" ? "Web · Firecrawl" : "Demo evidence"}</span>
                                <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {message.approval.status === "error" ? <p className="conversation-approval-error" role="alert">{message.approval.error}</p> : null}
                      </section>
                    ) : null}
                  </div>
                </div>
              ))}
              {isThinking ? <div className="thinking"><LoaderCircle size={16} /> Researching your request…</div> : null}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              {voiceStatus === "review" ? (
                <div className="voice-review" aria-labelledby="voice-review-label">
                  <label id="voice-review-label" htmlFor="voice-transcript"><strong>Review your transcript</strong></label>
                  <p>Edit anything OpenAI misheard. Nothing is sent to your growth agent until you confirm.</p>
                  <textarea
                    id="voice-transcript"
                    aria-label="Review voice transcript"
                    value={voiceTranscript}
                    onChange={(event) => setVoiceTranscript(event.target.value)}
                    disabled={!researchEnabled}
                  />
                  <div className="voice-review-actions">
                    <button type="button" onClick={() => { setVoiceTranscript(""); setVoiceStatus("idle"); }}>Discard</button>
                    <button type="button" onClick={() => void confirmVoiceTranscript()} disabled={!researchEnabled || !voiceTranscript.trim() || isThinking}>Send transcript to agent</button>
                  </div>
                </div>
              ) : null}
              <textarea
                aria-label="Message your growth agent"
                placeholder="Ask for ideas, analyse a competitor, or build a complete video package…"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={!researchEnabled}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitPrompt(prompt);
                  }
                }}
              />
              <label className="voice-consent" htmlFor="voice-upload-consent">
                <input
                  id="voice-upload-consent"
                  type="checkbox"
                  checked={voiceConsent}
                  disabled={!researchEnabled || voiceStatus === "listening" || voiceStatus === "processing"}
                  onChange={(event) => setVoiceConsent(event.target.checked)}
                />
                <span id="voice-upload-disclosure">I consent to this recording being uploaded to OpenAI for transcription. Growth Stack does not store the raw audio.</span>
              </label>
              <div className="voice-status" role="status" aria-live="polite">
                {voiceStatus === "listening" ? "Listening. Select stop when you’re finished." : null}
                {voiceStatus === "processing" ? speakingMessageId ? "Preparing the spoken reply…" : "Uploading securely and transcribing…" : null}
                {voiceStatus === "review" ? "Transcript ready for your review." : null}
                {voiceStatus === "speaking" ? "Playing the agent reply. You can stop it at any time." : null}
                {voiceStatus === "interrupted" ? "Reply stopped." : null}
                {voiceStatus === "error" ? voiceError : null}
              </div>
              <div className="composer-footer">
                <div className="research-mode"><Target size={15} /><span>Quick research</span><ChevronRight size={14} /></div>
                <div className="composer-actions">
                  <span className={voiceStatus === "listening" ? "listening active" : "listening"}><AudioLines size={15} />{voiceStatus === "listening" ? "Listening…" : voiceStatus === "processing" ? "Processing…" : voiceStatus === "speaking" ? "Speaking…" : voiceConsent ? "Voice ready" : "Voice muted"}</span>
                  <button
                    className={voiceStatus === "listening" ? "mic-button recording" : "mic-button"}
                    type="button"
                    onClick={toggleRecording}
                    aria-label={voiceStatus === "listening" ? "Stop recording" : "Start recording"}
                    aria-describedby="voice-upload-disclosure"
                    disabled={!researchEnabled || !voiceConsent || voiceStatus === "processing" || voiceStatus === "review"}
                  >
                    {voiceStatus === "listening" ? <StopCircle size={23} /> : <Mic size={23} />}
                  </button>
                  <button className="send-button" type="submit" aria-label="Send message to growth agent" disabled={!researchEnabled || !prompt.trim() || isThinking}><ChevronRight size={21} /></button>
                </div>
              </div>
            </form>
            <div className="suggestions">
              <button disabled={!researchEnabled} onClick={() => setPrompt("Find content gaps in AI productivity this week")}>Find content gaps</button>
              <button disabled={!researchEnabled} onClick={() => setPrompt("Analyse my top three competitors")}>Analyse competitors</button>
              <button disabled={!researchEnabled} onClick={() => setPrompt("Build a full video package from my strongest idea")}>Build a video package</button>
            </div>
          </section>

          <section className="dashboard-grid">
            <article className="panel ideas-panel">
              <div className="panel-heading">
                <div><span className="panel-icon red"><Lightbulb size={18} /></span><span><small>Fresh opportunities</small><h2>Ideas worth making</h2></span></div>
                <Link href="/ideas">View library <ChevronRight size={15} /></Link>
              </div>
              {dashboard?.ideas.length ? (
                <div className="idea-list">
                  {dashboard.ideas.map((idea, index) => (
                    <Link className="idea-row" href="/ideas" key={idea.id}>
                      <span className="score-ring" aria-label={idea.score === null ? "Not scored" : `Analysis score ${idea.score}`}>{idea.score ?? "—"}</span>
                      <span className="idea-copy"><small>{idea.signal ?? "Signal not analysed"}</small><strong>{idea.title}</strong></span>
                      <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyState
                  status={dashboard ? "empty" : "unavailable"}
                  title={dashboard ? "No ideas yet" : "Idea data is unavailable"}
                  description={dashboard ? "Complete a research run to start building an evidence-backed idea library." : "We could not load workspace ideas. Refresh the page or try again later."}
                  action={<Link href="/research">Open research</Link>}
                />
              )}
            </article>

            <article className="panel approval-panel">
              <div className="panel-heading">
                <div><span className="panel-icon indigo"><ShieldCheck size={18} /></span><span><small>Your decision</small><h2>Approval queue</h2></span></div>
                {dashboard?.approvals.length ? <span className="queue-count">{dashboard.approvals.length} waiting</span> : null}
              </div>
              {dashboard?.approvals.length ? dashboard.approvals.map((approval) => (
                <div className="approval-card" key={approval.id}>
                  <div className="approval-meta"><span>{approval.kind === "content_package" ? "Content package" : approval.kind === "research" ? "Research plan" : "Approval"}</span></div>
                  <h3>{approval.title}</h3>
                  {approval.summary ? <p>{approval.summary}</p> : null}
                  <div className="approval-actions"><Link className="approve" href="/approvals"><ShieldCheck size={15} /> Review decision</Link></div>
                </div>
              )) : (
                <WorkspaceEmptyState
                  status={dashboard ? "empty" : "unavailable"}
                  title={dashboard ? "Nothing waiting for approval" : "Approval data is unavailable"}
                  description={dashboard ? "Research and content decisions that need you will appear here." : "We could not load the approval queue. Refresh the page or try again later."}
                  action={<Link href="/approvals">Open approvals</Link>}
                />
              )}
            </article>
          </section>

          {dashboard?.activity ? (
            <section className="activity-strip" aria-label="Workspace activity">
              <div><span><small>Sources analysed</small><strong>{dashboard.activity.sourcesAnalysed}</strong></span></div>
              <div><span><small>Packages generated</small><strong>{dashboard.activity.packagesGenerated}</strong></span></div>
              <div><span><small>Best signal</small><strong>{dashboard.activity.bestSignal ?? "Not available yet"}</strong></span></div>
              <Link href="/performance">View performance <ChevronRight size={15} /></Link>
            </section>
          ) : <WorkspaceEmptyState status={dashboard ? "empty" : "unavailable"} title="No activity summary yet" description="Activity appears after research and content work is completed." />}
        </div>
    </WorkspaceShell>
  );
}
