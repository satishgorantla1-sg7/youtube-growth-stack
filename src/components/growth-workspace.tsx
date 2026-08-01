"use client";

import {
  AudioLines,
  BarChart3,
  BookOpenText,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Compass,
  FileText,
  Flame,
  Home,
  Lightbulb,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Mic,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Target,
  Volume2,
  VolumeX,
  Youtube,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ApprovalState = "pending" | "submitting" | "queued" | "cancelled" | "error";

type ResearchApproval = {
  approvalId: string;
  prompt: string;
  maxSources: number;
  estimatedCredits: number;
  status: ApprovalState;
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
  state?: "queued" | "cancelled";
  error?: string;
};

function starterMessages(displayName: string): Message[] {
  return [{
    id: "welcome",
    role: "assistant",
    text: `Good morning, ${displayName}. I found three promising gaps in AI productivity content. Want me to turn the strongest one into a complete video package?`,
  }];
}

const nav = [
  { icon: Home, label: "Command centre", active: true },
  { icon: Compass, label: "Research" },
  { icon: Lightbulb, label: "Idea library" },
  { icon: FileText, label: "Content packages" },
  { icon: ShieldCheck, label: "Approvals", count: 2 },
  { icon: BarChart3, label: "Performance" },
];

const ideas = [
  { score: 94, title: "I replaced 7 AI apps with one voice workflow", signal: "Fast-rising gap", tone: "signal-red" },
  { score: 89, title: "The honest cost of building an AI second brain", signal: "High search intent", tone: "signal-indigo" },
  { score: 86, title: "Stop prompting: build a system that remembers", signal: "Low competition", tone: "signal-green" },
];

type GrowthWorkspaceProps = {
  displayName?: string;
  workspaceName?: string;
  workspaceId?: string;
  signOutAction?: () => Promise<void>;
};

export function GrowthWorkspace({ displayName = "Satish", workspaceName = "Personal workspace", workspaceId, signOutAction }: GrowthWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>(() => starterMessages(displayName));
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const replyAudio = useRef<HTMLAudioElement | null>(null);
  const speechRequest = useRef<AbortController | null>(null);
  const replyAudioUrl = useRef<string | null>(null);
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
      releaseReplyAudio();
      if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel();
    };
  }, [releaseReplyAudio]);

  const submitPrompt = useCallback(async (value: string) => {
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
      const approval = result.state === "awaiting_approval" && result.approvalId ? {
        approvalId: result.approvalId,
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
  }, [isThinking, workspaceId]);

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
      setMessages((current) => current.map((message) => message.id === messageId && message.approval
        ? { ...message, approval: { ...message.approval, status: result.state === "queued" ? "queued" : "cancelled", error: undefined } }
        : message));
    } catch {
      setMessages((current) => current.map((message) => message.id === messageId && message.approval
        ? { ...message, approval: { ...message.approval, status: "error", error: "I couldn’t save your decision. Please try again." } }
        : message));
    }
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPrompt(prompt);
  }

  async function toggleRecording() {
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
    if (!transcript || isThinking) return;
    setVoiceTranscript("");
    setVoiceStatus("idle");
    await submitPrompt(transcript);
  }

  return (
    <main className="app-shell">
      <aside className={mobileNav ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark"><Youtube size={22} fill="currentColor" /></span>
          <span>Growth Stack</span>
        </div>
        <button className="new-project"><Plus size={17} /> New project</button>
        <nav className="main-nav" aria-label="Workspace">
          {nav.map((item) => (
            <button className={item.active ? "nav-item nav-active" : "nav-item"} key={item.label}>
              <item.icon size={18} /><span>{item.label}</span>
              {item.count ? <span className="nav-count">{item.count}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="plan-card">
          <div className="plan-icon"><Sparkles size={15} /></div>
          <strong>Starter workspace</strong>
          <span>62 of 100 credits left</span>
          <div className="progress"><i /></div>
          <button>View usage</button>
        </div>
        <div className="profile-row">
          <CircleUserRound size={29} />
          <span><strong>{displayName}</strong><small>{workspaceName}</small></span>
          {signOutAction ? (
            <form action={signOutAction}><button className="profile-action" type="submit" aria-label="Sign out"><LogOut size={16} /></button></form>
          ) : <Settings size={16} />}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Toggle navigation"><Menu /></button>
          <div className="crumb"><span>Workspace</span><ChevronRight size={14} /><strong>Command centre</strong></div>
          <div className="top-actions">
            <button className="status-pill"><i /> All systems ready</button>
            <button className="icon-button" aria-label="Search"><Search size={18} /></button>
          </div>
        </header>

        <div className="content">
          <section className="hero-copy">
            <div>
              <p className="eyebrow"><Flame size={15} fill="currentColor" /> Monday momentum</p>
              <h1>What should we grow today?</h1>
              <p>Talk naturally. Your research agent will investigate, build, and bring every important decision back to you.</p>
            </div>
            <div className="connected-channel">
              <span className="channel-avatar"><Youtube size={21} fill="currentColor" /></span>
              <span><small>Connected channel</small><strong>Satish Builds AI</strong></span>
              <i>Live</i>
            </div>
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
                          {message.approval.status === "queued" ? <><Check size={14} /> Approved. Research is queued.</> : null}
                          {message.approval.status === "cancelled" ? "Rejected. No research was queued and no credits were used." : null}
                        </div>
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
                  />
                  <div className="voice-review-actions">
                    <button type="button" onClick={() => { setVoiceTranscript(""); setVoiceStatus("idle"); }}>Discard</button>
                    <button type="button" onClick={() => void confirmVoiceTranscript()} disabled={!voiceTranscript.trim() || isThinking}>Send transcript to agent</button>
                  </div>
                </div>
              ) : null}
              <textarea
                aria-label="Message your growth agent"
                placeholder="Ask for ideas, analyse a competitor, or build a complete video package…"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
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
                  disabled={voiceStatus === "listening" || voiceStatus === "processing"}
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
                    disabled={!voiceConsent || voiceStatus === "processing" || voiceStatus === "review"}
                  >
                    {voiceStatus === "listening" ? <StopCircle size={23} /> : <Mic size={23} />}
                  </button>
                  <button className="send-button" type="submit" disabled={!prompt.trim() || isThinking}><ChevronRight size={21} /></button>
                </div>
              </div>
            </form>
            <div className="suggestions">
              <button onClick={() => setPrompt("Find content gaps in AI productivity this week")}>Find content gaps</button>
              <button onClick={() => setPrompt("Analyse my top three competitors")}>Analyse competitors</button>
              <button onClick={() => setPrompt("Build a full video package from my strongest idea")}>Build a video package</button>
            </div>
          </section>

          <section className="dashboard-grid">
            <article className="panel ideas-panel">
              <div className="panel-heading">
                <div><span className="panel-icon red"><Lightbulb size={18} /></span><span><small>Fresh opportunities</small><h2>Ideas worth making</h2></span></div>
                <button>View library <ChevronRight size={15} /></button>
              </div>
              <div className="idea-list">
                {ideas.map((idea, index) => (
                  <button className="idea-row" key={idea.title}>
                    <span className="score-ring">{idea.score}</span>
                    <span className="idea-copy"><small><i className={idea.tone} /> {idea.signal}</small><strong>{idea.title}</strong></span>
                    <span className="rank">0{index + 1}</span>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel approval-panel">
              <div className="panel-heading">
                <div><span className="panel-icon indigo"><ShieldCheck size={18} /></span><span><small>Your decision</small><h2>Approval queue</h2></span></div>
                <span className="queue-count">2 waiting</span>
              </div>
              <div className="approval-card">
                <div className="approval-meta"><span>Content package</span><span><Clock3 size={13} /> 4 min ago</span></div>
                <h3>Voice workflows that replace your AI subscriptions</h3>
                <p>3 titles · 2 thumbnail directions · hook · outline · full script</p>
                <div className="approval-actions"><button className="approve"><Check size={16} /> Review & approve</button><button>Open brief</button></div>
              </div>
              <div className="approval-card muted-card">
                <div className="approval-meta"><span>Research plan</span><span><Clock3 size={13} /> 18 min ago</span></div>
                <h3>Deep scan: emerging agent frameworks</h3>
                <p>Estimated cost: 12 credits · 20 sources</p>
              </div>
            </article>
          </section>

          <section className="activity-strip">
            <div><span className="activity-icon"><BookOpenText size={18} /></span><span><small>This week</small><strong>42 sources analysed</strong></span></div>
            <div><span className="activity-icon"><MessageSquareText size={18} /></span><span><small>Generated</small><strong>8 content packages</strong></span></div>
            <div><span className="activity-icon"><BarChart3 size={18} /></span><span><small>Best signal</small><strong>AI workflow tutorials</strong></span></div>
            <button>Open weekly report <ChevronRight size={15} /></button>
          </section>
        </div>
      </section>
    </main>
  );
}
