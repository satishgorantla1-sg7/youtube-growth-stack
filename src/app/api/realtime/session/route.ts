import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";

const unavailable = (error: string, message: string) =>
  NextResponse.json({ error, message }, { status: 503 });

export async function POST() {
  const access = await authorizeVoiceRequest("realtime");
  if (!access.allowed) return access.response;
  if (access.demo) {
    return unavailable(
      "realtime_voice_unavailable",
      "Realtime voice is unavailable in demo mode. Configure OpenAI and disable demo mode, or continue with text.",
    );
  }

  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    return unavailable(
      "realtime_voice_not_configured",
      "Realtime voice needs an OPENAI_API_KEY on the server. Add it to the deployment environment, then retry.",
    );
  }
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ session: {
        type: "realtime",
        model: env.OPENAI_REALTIME_MODEL,
        instructions: "You are the concise voice interface for YouTube Growth Stack. Never perform paid research, publishing, or destructive actions without an explicit recorded approval.",
        audio: { output: { voice: env.OPENAI_VOICE } },
      } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json(
      { error: "realtime_session_timeout", message: "OpenAI did not create a voice session in time. Please retry." },
      { status: 504 },
    );
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: "realtime_session_failed", message: "OpenAI could not create a voice session. Please retry or use text." },
      { status: 502 },
    );
  }

  const session = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!session || typeof session.value !== "string" || !session.value) {
    return NextResponse.json(
      { error: "realtime_session_invalid", message: "OpenAI returned an invalid voice session. Please retry." },
      { status: 502 },
    );
  }
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}
