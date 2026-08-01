import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

const speechSchema = z.object({ text: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request) {
  const env = serverEnv();
  const parsed = speechSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid speech request" }, { status: 400 });
  if (!env.OPENAI_API_KEY) return new Response(null, { status: 204 });
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_SPEECH_MODEL, voice: env.OPENAI_VOICE, input: parsed.data.text }),
  });
  if (!response.ok) return NextResponse.json({ error: "Speech generation failed" }, { status: 502 });
  return new Response(response.body, { headers: { "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg" } });
}
