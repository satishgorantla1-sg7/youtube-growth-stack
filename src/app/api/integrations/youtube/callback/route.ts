import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { completeYouTubeAuthorization, SupabaseYouTubeOAuthRepository } from "@/lib/providers/youtube-connect";
import { GoogleYouTubeOAuthProvider, readYouTubeOAuthConfig } from "@/lib/providers/youtube-oauth";
import { readTokenCipher } from "@/lib/providers/youtube-token-crypto";

export async function GET(request: NextRequest) {
  const config = readYouTubeOAuthConfig();
  const cipher = readTokenCipher();
  if (!config || !cipher) return redirect(request, "youtube_not_configured");
  const client = await createClient();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return redirect(request, "authentication_required");
  const result = await completeYouTubeAuthorization(request.nextUrl.searchParams, {
    repository: new SupabaseYouTubeOAuthRepository(client),
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
