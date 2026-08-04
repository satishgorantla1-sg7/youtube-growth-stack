import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { completeYouTubeAuthorization, SupabaseYouTubeOAuthRepository, SupabaseYouTubeProviderQuotaRepository } from "@/lib/providers/youtube-connect";
import { GoogleYouTubeOAuthProvider, readYouTubeOAuthConfig } from "@/lib/providers/youtube-oauth";
import { readTokenCipher } from "@/lib/providers/youtube-token-crypto";

export async function GET(request: NextRequest) {
  const config = readYouTubeOAuthConfig();
  const cipher = readTokenCipher();
  const serviceKey = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!config || !cipher || !serviceKey || !supabaseUrl) return redirect(request, "youtube_not_configured");
  const client = await createClient();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return redirect(request, "authentication_required");
  const serviceClient = createServiceClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await completeYouTubeAuthorization(request.nextUrl.searchParams, {
    repository: new SupabaseYouTubeOAuthRepository(client),
    quotaRepository: new SupabaseYouTubeProviderQuotaRepository(serviceClient),
    provider: new GoogleYouTubeOAuthProvider(config),
    cipher,
    authenticatedUserId: user.data.user.id,
  });
  return redirect(request, result.ok ? "connected" : result.error);
}

function redirect(request: NextRequest, outcome: string) {
  const target = new URL("/settings/youtube", request.url);
  target.searchParams.set("youtube", outcome);
  return NextResponse.redirect(target);
}
