import { NextResponse } from "next/server";
import { hasSupabaseConfig, isDemoMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type VoiceOperation = "transcribe" | "speech" | "realtime";

type VoiceAccess =
  | { allowed: true; demo: true }
  | { allowed: true; demo: false; userId: string; workspaceId: string }
  | { allowed: false; response: NextResponse };

const limits: Record<VoiceOperation, number> = { transcribe: 10, speech: 30, realtime: 5 };
const windowMs = 60_000;
const requests = new Map<string, number[]>();

function reject(error: string, status: number, retryAfter?: number): VoiceAccess {
  return {
    allowed: false,
    response: NextResponse.json(
      { error },
      { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
    ),
  };
}

export function resetVoiceRateLimitsForTests() {
  requests.clear();
}

export function consumeVoiceRateLimit(key: string, operation: VoiceOperation, now = Date.now()) {
  const active = (requests.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (active.length >= limits[operation]) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - active[0])) / 1_000));
    requests.set(key, active);
    return { allowed: false as const, retryAfter };
  }
  active.push(now);
  requests.set(key, active);
  return { allowed: true as const };
}

export async function authorizeVoiceRequest(operation: VoiceOperation): Promise<VoiceAccess> {
  // Demo mode must never call a paid provider, even if a key is present locally.
  if (isDemoMode() || !hasSupabaseConfig()) return { allowed: true, demo: true };

  const client = await createClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError || !userData.user) return reject("authentication_required", 401);

  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) return reject("voice_authorization_unavailable", 503);
  if (!membership) return reject("workspace_required", 403);

  const rate = consumeVoiceRateLimit(`${membership.workspace_id}:${userData.user.id}:${operation}`, operation);
  if (!rate.allowed) return reject("voice_rate_limit_exceeded", 429, rate.retryAfter);

  return { allowed: true, demo: false, userId: userData.user.id, workspaceId: membership.workspace_id };
}
