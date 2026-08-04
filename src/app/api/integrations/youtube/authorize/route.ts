import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { beginYouTubeAuthorization, SupabaseYouTubeOAuthRepository } from "@/lib/providers/youtube-connect";
import { GoogleYouTubeOAuthProvider, readYouTubeOAuthConfig } from "@/lib/providers/youtube-oauth";

export async function POST(request: Request) {
  const config = readYouTubeOAuthConfig();
  if (!config) return NextResponse.json({ error: "youtube_oauth_not_configured" }, { status: 503 });
  const client = await createClient();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const result = await beginYouTubeAuthorization(await request.json().catch(() => null), {
    repository: new SupabaseYouTubeOAuthRepository(client),
    provider: new GoogleYouTubeOAuthProvider(config),
  });
  return NextResponse.json(result.ok ? { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt } : { error: result.error }, { status: result.status });
}
