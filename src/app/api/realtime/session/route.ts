import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";

export async function POST() {
  const env = serverEnv();
  if (!env.OPENAI_API_KEY) return NextResponse.json({ error: "Realtime voice is not configured" }, { status: 503 });
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session: {
      type: "realtime", model: env.OPENAI_REALTIME_MODEL,
      instructions: "You are the concise voice interface for YouTube Growth Stack. Never perform paid research, publishing, or destructive actions without an explicit recorded approval.",
      audio: { output: { voice: env.OPENAI_VOICE } },
    } }),
  });
  if (!response.ok) return NextResponse.json({ error: "Could not create a Realtime session" }, { status: 502 });
  return NextResponse.json(await response.json());
}
