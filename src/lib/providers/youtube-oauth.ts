import { z } from "zod";

export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const YOUTUBE_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const channelResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    snippet: z.object({
      title: z.string().min(1),
      customUrl: z.string().optional(),
      thumbnails: z.record(z.string(), z.object({ url: z.string().url() })).optional(),
    }),
  })).min(1),
});

export type YouTubeOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type YouTubeTokenSet = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  scopes: string[];
};

export type YouTubeOwnedChannel = {
  externalId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
};

export class YouTubeOAuthError extends Error {
  constructor(public readonly code: string, public readonly retryable = false) {
    super(code);
    this.name = "YouTubeOAuthError";
  }
}

export function readYouTubeOAuthConfig(environment: NodeJS.ProcessEnv = process.env): YouTubeOAuthConfig | null {
  const parsed = z.object({
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    YOUTUBE_REDIRECT_URI: z.string().url(),
  }).safeParse(environment);
  if (!parsed.success) return null;
  return {
    clientId: parsed.data.GOOGLE_CLIENT_ID,
    clientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
    redirectUri: parsed.data.YOUTUBE_REDIRECT_URI,
  };
}

type Fetch = typeof fetch;

export class GoogleYouTubeOAuthProvider {
  constructor(
    private readonly config: YouTubeOAuthConfig,
    private readonly fetcher: Fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  authorizationUrl(state: string) {
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: YOUTUBE_READONLY_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string): Promise<YouTubeTokenSet> {
    const response = await this.request(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    return this.parseTokens(response, true);
  }

  async refresh(refreshToken: string): Promise<YouTubeTokenSet> {
    const response = await this.request(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await this.parseTokens(response, false);
    return { ...tokens, refreshToken };
  }

  async ownedChannel(accessToken: string): Promise<YouTubeOwnedChannel> {
    const url = new URL(YOUTUBE_CHANNELS_URL);
    url.search = new URLSearchParams({ part: "snippet", mine: "true", maxResults: "1" }).toString();
    const response = await this.request(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw await this.safeProviderError(response);
    const parsed = channelResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new YouTubeOAuthError("youtube_channel_response_invalid");
    const channel = parsed.data.items[0];
    const thumbnails = Object.values(channel.snippet.thumbnails ?? {});
    return {
      externalId: channel.id,
      title: channel.snippet.title,
      handle: channel.snippet.customUrl ?? null,
      thumbnailUrl: thumbnails.at(-1)?.url ?? null,
    };
  }

  async revoke(token: string): Promise<void> {
    const response = await this.request(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    if (!response.ok) throw await this.safeProviderError(response);
  }

  private async parseTokens(response: Response, requireRefreshToken: boolean): Promise<YouTubeTokenSet> {
    if (!response.ok) throw await this.safeProviderError(response);
    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new YouTubeOAuthError("youtube_token_response_invalid");
    if (requireRefreshToken && !parsed.data.refresh_token) {
      throw new YouTubeOAuthError("youtube_refresh_token_missing");
    }
    const scopes = (parsed.data.scope ?? YOUTUBE_READONLY_SCOPE).split(" ").filter(Boolean);
    if (scopes.some((scope) => scope !== YOUTUBE_READONLY_SCOPE) || !scopes.includes(YOUTUBE_READONLY_SCOPE)) {
      throw new YouTubeOAuthError("youtube_scope_mismatch");
    }
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + parsed.data.expires_in * 1000).toISOString(),
      scopes,
    };
  }

  private async request(input: string | URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      if (error instanceof YouTubeOAuthError) throw error;
      throw new YouTubeOAuthError("youtube_provider_unavailable", true);
    }
  }

  private async safeProviderError(response: Response) {
    const body = await response.json().catch(() => null) as { error?: string | { status?: string } } | null;
    const providerCode = typeof body?.error === "string" ? body.error : body?.error?.status;
    if (providerCode === "invalid_grant") return new YouTubeOAuthError("youtube_reconnect_required");
    if (response.status === 429 || response.status >= 500) return new YouTubeOAuthError("youtube_provider_unavailable", true);
    return new YouTubeOAuthError("youtube_provider_rejected_request");
  }
}
