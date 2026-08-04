import { z } from "zod";

const privateSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_SPEECH_MODEL: z.string().default("tts-1"),
  OPENAI_VOICE: z.string().default("marin"),
  PAID_RESEARCH_PROVIDERS_ENABLED: z.enum(["true", "false"]).default("false"),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  APIFY_API_TOKEN: z.string().min(1).optional(),
  APIFY_YOUTUBE_ACTOR_ID: z.string().default("streamers/youtube-scraper"),
  MAX_RESEARCH_SOURCES: z.coerce.number().int().positive().max(100).default(25),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  RESEARCH_WORKER_ID: z.string().min(1).max(80).default("research-vercel"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  YOUTUBE_REDIRECT_URI: z.string().url().optional(),
  YOUTUBE_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  YOUTUBE_TOKEN_ENCRYPTION_KEY_VERSION: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/).default("v1"),
  YOUTUBE_TOKEN_DECRYPTION_KEYS: z.string().optional(),
});

export function serverEnv() { return privateSchema.parse(process.env); }
export function isDemoMode() { return process.env.NEXT_PUBLIC_DEMO_MODE !== "false"; }
export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
