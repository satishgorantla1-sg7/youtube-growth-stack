import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { serverEnv } from "@/lib/env";
import { SupabaseYouTubeTokenLifecycleRepository } from "@/lib/providers/youtube-connection-repository";
import { GoogleYouTubeOAuthProvider, readYouTubeOAuthConfig, YouTubeOAuthError } from "@/lib/providers/youtube-oauth";
import { readTokenCipher } from "@/lib/providers/youtube-token-crypto";
import { YouTubeTokenLifecycle } from "@/lib/providers/youtube-token-lifecycle";
import { authorizeApprovedRevocation, YoutubeLifecycleError, youtubeDisconnectSchema } from "./lifecycle-controls";
import type { z } from "zod";

type AuthenticatedClient = Parameters<typeof authorizeApprovedRevocation>[0];
type DisconnectInput = z.infer<typeof youtubeDisconnectSchema>;

export async function disconnectYoutube(
  client: AuthenticatedClient,
  input: DisconnectInput,
  createLifecycle: () => YouTubeTokenLifecycle = createYouTubeTokenLifecycle,
) {
  const approval = await authorizeApprovedRevocation(client, input.approvalId);
  if (approval.workspaceId !== input.workspaceId) throw new YoutubeLifecycleError("youtube_lifecycle_forbidden");
  try {
    const result = await createLifecycle().revoke(input.workspaceId, input.approvalId);
    if (result.status === "locked") throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
    return { status: "revoked" as const };
  } catch (error) {
    if (error instanceof YoutubeLifecycleError) throw error;
    if (error instanceof YouTubeOAuthError && error.retryable) throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
    throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
  }
}

function createYouTubeTokenLifecycle() {
  const config = readYouTubeOAuthConfig();
  const cipher = readTokenCipher();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !cipher || !url || !serviceKey) throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
  const serviceClient = createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new YouTubeTokenLifecycle(
    new SupabaseYouTubeTokenLifecycleRepository(serviceClient),
    new GoogleYouTubeOAuthProvider(config),
    cipher,
  );
}
