"use client";

import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Keyboard,
  LoaderCircle, LockKeyhole, Mic, RefreshCw, ShieldCheck, Sparkles,
  UserRound, Youtube,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ChannelConnectionAdapter,
  ChannelConnectionState,
  createDemoChannelConnection,
} from "@/lib/providers/channel-connection";
import styles from "./onboarding-flow.module.css";

export type OnboardingStep = "profile" | "channel" | "voice" | "complete";
type VoiceState = "idle" | "requesting" | "ready" | "denied" | "unavailable";

const steps: { id: OnboardingStep; label: string }[] = [
  { id: "profile", label: "Workspace" },
  { id: "channel", label: "Channel" },
  { id: "voice", label: "Voice" },
  { id: "complete", label: "Ready" },
];

const connectionCopy: Record<ChannelConnectionState["status"], { title: string; detail: string }> = {
  disconnected: { title: "No channel connected", detail: "Connect when you are ready. Demo mode never stores OAuth tokens." },
  connecting: { title: "Connecting securely…", detail: "In production, Google opens in a separate consent screen." },
  connected: { title: "Channel connected", detail: "Your workspace can now tailor research to this channel." },
  expired: { title: "Connection expired", detail: "Reconnect to refresh permission without losing workspace progress." },
  error: { title: "Connection failed", detail: "Nothing was saved. Check your connection and try again." },
};

export function OnboardingFlow({
  connectionAdapter,
  initialConnectionState = { status: "disconnected" },
  initialStep = "profile",
  initialDisplayName = "",
  initialWorkspaceName = "",
}: {
  connectionAdapter?: ChannelConnectionAdapter;
  initialConnectionState?: ChannelConnectionState;
  initialStep?: OnboardingStep;
  initialDisplayName?: string;
  initialWorkspaceName?: string;
}) {
  const adapter = useMemo(() => connectionAdapter ?? createDemoChannelConnection(), [connectionAdapter]);
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [connection, setConnection] = useState<ChannelConnectionState>(initialConnectionState);
  const [channelConsent, setChannelConsent] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const stepIndex = steps.findIndex((item) => item.id === step);

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (displayName.trim() && workspaceName.trim()) setStep("channel");
  }

  async function connectChannel() {
    if (!channelConsent) return;
    setConnection({ status: "connecting" });
    try {
      const channel = await adapter.connect({ consentGranted: true });
      setConnection({ status: "connected", channel });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not connect the channel.";
      setConnection({
        status: message.toLowerCase().includes("expired") ? "expired" : "error",
        message,
      });
    }
  }

  async function requestMicrophone() {
    if (!voiceConsent) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceState("unavailable");
      return;
    }
    setVoiceState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceState("ready");
    } catch {
      setVoiceState("denied");
    }
  }

  const statusCopy = connectionCopy[connection.status];

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="YouTube Growth Stack home">
          <span className={styles.brandMark}><Youtube size={22} fill="currentColor" /></span>
          <span>Growth Stack</span>
        </Link>
        <span className={styles.secure}><LockKeyhole size={14} /> Private by default</span>
      </header>

      <div className={styles.layout}>
        <aside className={styles.intro}>
          <p className={styles.eyebrow}><Sparkles size={15} /> Creator setup</p>
          <h1>Build a workspace that knows your channel.</h1>
          <p>Four thoughtful steps, with every permission kept in your hands.</p>
          <ol className={styles.steps} aria-label="Onboarding progress">
            {steps.map((item, index) => {
              const current = item.id === step;
              const complete = index < stepIndex;
              return (
                <li className={current ? styles.currentStep : complete ? styles.completeStep : ""} key={item.id} aria-current={current ? "step" : undefined}>
                  <span>{complete ? <Check size={15} /> : index + 1}</span>
                  <div><strong>{item.label}</strong><small>{current ? "You are here" : complete ? "Complete" : "Up next"}</small></div>
                </li>
              );
            })}
          </ol>
          <div className={styles.promise}>
            <ShieldCheck size={20} />
            <span><strong>You stay in control</strong><small>We ask before opening Google or your microphone.</small></span>
          </div>
        </aside>

        <section className={styles.card} aria-live="polite">
          {step === "profile" ? (
            <form onSubmit={saveProfile}>
              <StepHeading icon={<UserRound />} eyebrow="Start with the essentials" title="Make this space yours" description="These details personalise your workspace. You can change them later." />
              <div className={styles.fields}>
                <label>What should we call you?<input autoFocus autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" required /></label>
                <label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Studio growth lab" required /></label>
              </div>
              <div className={styles.cardFooter}><span>Step 1 of 4</span><button className={styles.primaryButton} type="submit">Continue <ArrowRight size={17} /></button></div>
            </form>
          ) : null}

          {step === "channel" ? (
            <div>
              <StepHeading icon={<Youtube />} eyebrow="Bring your context" title="Connect your YouTube channel" description="We use channel context to sharpen research and recommendations—not to publish content." />
              <div className={`${styles.statusCard} ${styles[connection.status]}`} role="status">
                <span className={styles.statusIcon}>
                  {connection.status === "connecting" ? <LoaderCircle className={styles.spin} /> : connection.status === "connected" ? <CheckCircle2 /> : connection.status === "disconnected" ? <Youtube /> : <CircleAlert />}
                </span>
                <span><strong>{statusCopy.title}</strong><small>{connection.status === "connected" ? `${connection.channel.title} · ${connection.channel.handle}` : statusCopy.detail}</small></span>
              </div>
              {connection.status !== "connected" ? (
                <div className={styles.consentBox}>
                  <label>
                    <input type="checkbox" checked={channelConsent} onChange={(event) => setChannelConsent(event.target.checked)} />
                    <span><strong>I’m ready to continue to Google</strong><small>Google will show the exact account access requested. Growth Stack cannot publish, edit, or delete videos during onboarding.</small></span>
                  </label>
                  <button className={styles.primaryButton} type="button" disabled={!channelConsent || connection.status === "connecting"} onClick={() => void connectChannel()}>
                    {connection.status === "connecting" ? <><LoaderCircle className={styles.spin} size={17} /> Connecting…</> : connection.status === "error" || connection.status === "expired" ? <><RefreshCw size={16} /> Retry connection</> : <>Connect channel <ArrowRight size={17} /></>}
                  </button>
                </div>
              ) : (
                <div className={styles.infoRow}><ShieldCheck size={18} /><span>Demo connection active. No OAuth token has been requested or stored.</span></div>
              )}
              <div className={styles.cardFooter}><button className={styles.backButton} type="button" onClick={() => setStep("profile")}><ArrowLeft size={16} /> Back</button><button className={styles.primaryButton} type="button" disabled={connection.status !== "connected"} onClick={() => setStep("voice")}>Continue <ArrowRight size={17} /></button></div>
            </div>
          ) : null}

          {step === "voice" ? (
            <div>
              <StepHeading icon={<Mic />} eyebrow="Optional and reversible" title="Choose how you want to work" description="Voice makes brainstorming natural. Typing is always available and equally capable." />
              <div className={styles.choiceGrid}>
                <article><span className={styles.choiceIcon}><Mic /></span><h3>Use voice</h3><p>Your browser asks for microphone access only after you confirm below. Audio is not retained by this setup check.</p></article>
                <article><span className={styles.choiceIcon}><Keyboard /></span><h3>Keep typing</h3><p>Every action has a keyboard and text alternative. You can enable voice later in settings.</p></article>
              </div>
              {voiceState === "ready" ? <div className={`${styles.notice} ${styles.successNotice}`} role="status"><CheckCircle2 /> Microphone is ready. The test stream was closed immediately.</div> : null}
              {voiceState === "denied" ? <div className={styles.notice} role="alert"><CircleAlert /> Access was blocked. Update browser permissions and retry, or continue with text.</div> : null}
              {voiceState === "unavailable" ? <div className={styles.notice} role="status"><CircleAlert /> This browser does not expose microphone access. Text mode remains available.</div> : null}
              <div className={styles.consentBox}>
                <label>
                  <input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} />
                  <span><strong>I understand and want to test my microphone</strong><small>This confirmation comes before the browser permission prompt. The test does not record or upload audio.</small></span>
                </label>
                <button className={styles.secondaryButton} type="button" disabled={!voiceConsent || voiceState === "requesting"} onClick={() => void requestMicrophone()}>
                  {voiceState === "requesting" ? <><LoaderCircle className={styles.spin} size={17} /> Requesting…</> : voiceState === "denied" ? <><RefreshCw size={16} /> Try microphone again</> : <><Mic size={17} /> Enable microphone</>}
                </button>
              </div>
              <div className={styles.cardFooter}><button className={styles.backButton} type="button" onClick={() => setStep("channel")}><ArrowLeft size={16} /> Back</button><button className={styles.primaryButton} type="button" onClick={() => setStep("complete")}>{voiceState === "ready" ? "Finish setup" : "Continue with text"} <ArrowRight size={17} /></button></div>
            </div>
          ) : null}

          {step === "complete" ? (
            <div className={styles.complete}>
              <span className={styles.completeIcon}><CheckCircle2 /></span>
              <p className={styles.eyebrow}>Setup complete</p>
              <h2>You’re ready to grow, {displayName}.</h2>
              <p>Your {workspaceName} workspace is connected to demo channel context. Start with voice or text whenever inspiration lands.</p>
              <div className={styles.summary}>
                <span><Check /> Workspace created</span><span><Check /> Demo channel connected</span><span>{voiceState === "ready" ? <Check /> : <Keyboard />} {voiceState === "ready" ? "Voice ready" : "Text mode ready"}</span>
              </div>
              <Link className={styles.primaryButton} href="/">Open command centre <ArrowRight size={17} /></Link>
              <small className={styles.demoNote}>Demo setup is stored only in this page session.</small>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StepHeading({ icon, eyebrow, title, description }: { icon: React.ReactNode; eyebrow: string; title: string; description: string }) {
  return <header className={styles.stepHeading}><span className={styles.stepIcon}>{icon}</span><p className={styles.eyebrow}>{eyebrow}</p><h2>{title}</h2><p>{description}</p></header>;
}
