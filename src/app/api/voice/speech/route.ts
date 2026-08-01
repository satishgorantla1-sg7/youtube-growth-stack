import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";

const speechSchema = z.object({ text: z.string().trim().min(1).max(2_000) });

const unavailable = (error: string, message: string) =>
  NextResponse.json({ error, message }, { status: 503 });

export async function POST(request: Request) {
  const access = await authorizeVoiceRequest("speech");
  if (!access.allowed) return access.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON is required" }, { status: 415 });
  }
  const parsed = speechSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid speech request" }, { status: 400 });
  if (access.demo) {
    return unavailable(
      "voice_speech_unavailable",
      "OpenAI speech is unavailable in demo mode. Use the browser speech fallback or continue with text.",
    );
  }

  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    return unavailable(
      "voice_speech_not_configured",
      "Speech playback needs an OPENAI_API_KEY on the server. Add it to the deployment environment, then retry.",
    );
  }
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.OPENAI_SPEECH_MODEL, voice: env.OPENAI_VOICE, input: parsed.data.text }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "voice_speech_timeout", message: "OpenAI did not respond in time. Please retry or use text output." },
      { status: 504 },
    );
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: "voice_speech_failed", message: "OpenAI could not generate speech. Please retry or use text output." },
      { status: 502 },
    );
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
