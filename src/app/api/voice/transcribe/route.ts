import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.OPENAI_API_KEY) return NextResponse.json({ text: "Find the strongest content gap in AI productivity and prepare a video package" });
  const incoming = await request.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio file is too large" }, { status: 413 });
  const body = new FormData();
  body.append("file", audio, audio.name || "voice.webm");
  body.append("model", env.OPENAI_TRANSCRIPTION_MODEL);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body,
  });
  if (!response.ok) return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  return NextResponse.json(await response.json());
}
