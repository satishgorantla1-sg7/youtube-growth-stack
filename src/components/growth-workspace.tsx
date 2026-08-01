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
  Youtube,
} from "lucide-react";
import { FormEvent, useCallback, useRef, useState } from "react";

type Message = { id: string; role: "user" | "assistant"; text: string };

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
  signOutAction?: () => Promise<void>;
};

export function GrowthWorkspace({ displayName = "Satish", workspaceName = "Personal workspace", signOutAction }: GrowthWorkspaceProps) {
  const [messages, setMessages] = useState<Message[]>(() => starterMessages(displayName));
  const [prompt, setPrompt] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const speak = useCallback(async (text: string) => {
    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (response.ok && response.status !== 204) {
        const audio = new Audio(URL.createObjectURL(await response.blob()));
        await audio.play();
        return;
      }
    } catch {
      // The browser voice fallback below keeps demo mode fully usable.
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }, []);

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
        body: JSON.stringify({ prompt: clean, mode: "quick", sources: ["youtube", "web"], idempotencyKey: crypto.randomUUID() }),
      });
      const result = (await response.json()) as { message?: string };
      const reply = result.message ?? "I queued the research. I’ll bring the evidence and draft to your approval queue.";
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: reply }]);
      void speak(reply);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: "I couldn’t start that run. Check the provider status and try again." },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, speak]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPrompt(prompt);
  }

  async function toggleRecording() {
    if (isRecording && recorder.current) {
      recorder.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextRecorder = new MediaRecorder(stream);
      chunks.current = [];
      nextRecorder.ondataavailable = (event) => chunks.current.push(event.data);
      nextRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const body = new FormData();
        body.append("audio", new Blob(chunks.current, { type: nextRecorder.mimeType }), "voice.webm");
        const response = await fetch("/api/voice/transcribe", { method: "POST", body });
        const result = (await response.json()) as { text?: string };
        if (result.text) await submitPrompt(result.text);
      };
      recorder.current = nextRecorder;
      nextRecorder.start();
      setIsRecording(true);
    } catch {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Microphone access is blocked. You can enable it in your browser settings or keep typing here.",
      }]);
    }
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
                  <div><small>{message.role === "assistant" ? "Growth agent" : "You"}</small><p>{message.text}</p></div>
                </div>
              ))}
              {isThinking ? <div className="thinking"><LoaderCircle size={16} /> Researching your request…</div> : null}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
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
              <div className="composer-footer">
                <div className="research-mode"><Target size={15} /><span>Quick research</span><ChevronRight size={14} /></div>
                <div className="composer-actions">
                  <span className={isRecording ? "listening active" : "listening"}><AudioLines size={15} />{isRecording ? "Listening…" : "Voice ready"}</span>
                  <button className={isRecording ? "mic-button recording" : "mic-button"} type="button" onClick={toggleRecording} aria-label={isRecording ? "Stop recording" : "Start recording"}>
                    {isRecording ? <StopCircle size={23} /> : <Mic size={23} />}
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
