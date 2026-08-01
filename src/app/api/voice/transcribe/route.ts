import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";

export const runtime = "nodejs";

const unavailable = (error: string, message: string) =>
  NextResponse.json({ error, message }, { status: 503 });

export async function POST(request: Request) {
  const access = await authorizeVoiceRequest("transcribe");
  if (!access.allowed) return access.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "Multipart audio is required" }, { status: 415 });
  }
  if (access.demo) {
    return unavailable(
      "voice_transcription_unavailable",
      "Voice transcription is unavailable in demo mode. Configure OpenAI and disable demo mode, or continue by typing your request.",
    );
  }

  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    return unavailable(
      "voice_transcription_not_configured",
      "Voice transcription needs an OPENAI_API_KEY on the server. Add it to the deployment environment, then retry.",
    );
  }
  const incoming = await request.formData().catch(() => null);
  if (!incoming) return NextResponse.json({ error: "Invalid multipart request" }, { status: 400 });
  const audio = incoming.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  if (audio.size === 0) return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  const audioType = audio.type.toLowerCase().split(";", 1)[0];
  const allowedTypes = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg"]);
  if (!allowedTypes.has(audioType)) return NextResponse.json({ error: "Unsupported audio type" }, { status: 415 });

  const body = new FormData();
  body.append("file", audio, audio.name || "voice.webm");
  body.append("model", env.OPENAI_TRANSCRIPTION_MODEL);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return NextResponse.json(
      { error: "voice_transcription_timeout", message: "OpenAI did not respond in time. Please retry the recording." },
      { status: 504 },
    );
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: "voice_transcription_failed", message: "OpenAI could not transcribe this recording. Please retry or use text input." },
      { status: 502 },
    );
  }

  const result = await response.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof result?.text === "string" ? result.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "no_speech_detected", message: "No speech was detected. Please retry closer to the microphone or use text input." },
      { status: 422 },
    );
  }

  return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
}
