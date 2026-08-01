import { z } from "zod";

const privateSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_SPEECH_MODEL: z.string().default("tts-1"),
  OPENAI_VOICE: z.string().default("marin"),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  APIFY_API_TOKEN: z.string().min(1).optional(),
  APIFY_YOUTUBE_ACTOR_ID: z.string().default("streamers/youtube-scraper"),
  MAX_RESEARCH_SOURCES: z.coerce.number().int().positive().max(100).default(25),
});

export function serverEnv() { return privateSchema.parse(process.env); }
export function isDemoMode() { return process.env.NEXT_PUBLIC_DEMO_MODE !== "false"; }
export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
