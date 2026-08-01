import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { authorizeVoiceRequest } from "@/lib/voice/access";

const speechSchema = z.object({ text: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request) {
  const access = await authorizeVoiceRequest("speech");
  if (!access.allowed) return access.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "JSON is required" }, { status: 415 });
  }
  const parsed = speechSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid speech request" }, { status: 400 });
  if (access.demo) return new Response(null, { status: 204 });

  const env = serverEnv();
  if (!env.OPENAI_API_KEY) return NextResponse.json({ error: "Speech generation is not configured" }, { status: 503 });
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.OPENAI_SPEECH_MODEL, voice: env.OPENAI_VOICE, input: parsed.data.text }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json({ error: "Speech generation timed out" }, { status: 504 });
  }
  if (!response.ok) return NextResponse.json({ error: "Speech generation failed" }, { status: 502 });
  return new Response(response.body, { headers: { "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg" } });
}
