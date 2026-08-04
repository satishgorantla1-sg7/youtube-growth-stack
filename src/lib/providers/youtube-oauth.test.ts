import { describe, expect, it, vi } from "vitest";
import { GoogleYouTubeOAuthProvider, YOUTUBE_READONLY_SCOPE } from "./youtube-oauth";

const config = { clientId: "client-id", clientSecret: "client-secret", redirectUri: "https://app.example/api/integrations/youtube/callback" };

describe("GoogleYouTubeOAuthProvider", () => {
  it("requests offline access with only youtube.readonly and an opaque state", () => {
    const provider = new GoogleYouTubeOAuthProvider(config);
    const url = new URL(provider.authorizationUrl("opaque-state"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(YOUTUBE_READONLY_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBeNull();
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("exchanges a code server-side and never sends the secret in a URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      scope: YOUTUBE_READONLY_SCOPE, token_type: "Bearer",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new GoogleYouTubeOAuthProvider(config, fetcher);
    const tokens = await provider.exchangeCode("one-time-code");
    expect(tokens.refreshToken).toBe("refresh-secret");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://oauth2.googleapis.com/token");
    expect(String(url)).not.toContain("client-secret");
    expect(String(init.body)).toContain("client_secret=client-secret");
  });

  it("fails closed when Google returns broader or missing scopes", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access", refresh_token: "refresh", expires_in: 3600,
      scope: `${YOUTUBE_READONLY_SCOPE} https://www.googleapis.com/auth/youtube`,
    }), { status: 200 }));
    await expect(new GoogleYouTubeOAuthProvider(config, fetcher).exchangeCode("code"))
      .rejects.toMatchObject({ code: "youtube_scope_mismatch" });
  });

  it("maps invalid_grant to reconnect without returning provider payloads", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "sensitive provider text" }), { status: 400 }));
    await expect(new GoogleYouTubeOAuthProvider(config, fetcher).refresh("refresh-secret"))
      .rejects.toMatchObject({ code: "youtube_reconnect_required", message: "youtube_reconnect_required" });
  });

  it.each([1, 2, 50])("returns a bounded owned-channel array with %i channel(s)", async (count) => {
    const items = Array.from({ length: count }, (_, index) => ({
      id: `UC${index}`,
      snippet: { title: `Channel ${index}`, customUrl: `@channel-${index}` },
      contentDetails: { relatedPlaylists: { uploads: `UU${index}` } },
    }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
    const channels = await new GoogleYouTubeOAuthProvider(config, fetcher).ownedChannels("access-secret");
    expect(channels).toHaveLength(count);
    expect(channels[0]).toEqual({ externalId: "UC0", title: "Channel 0", handle: "@channel-0", thumbnailUrl: null, uploadsPlaylistId: "UU0" });
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("part")).toBe("snippet,contentDetails");
    expect(url.searchParams.get("mine")).toBe("true");
    expect(url.searchParams.get("maxResults")).toBe("50");
  });

  it("rejects a provider response above the 50-channel contract bound", async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      id: `UC${index}`,
      snippet: { title: `Channel ${index}` },
      contentDetails: { relatedPlaylists: { uploads: `UU${index}` } },
    }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items }), { status: 200 }));
    await expect(new GoogleYouTubeOAuthProvider(config, fetcher).ownedChannels("access-secret"))
      .rejects.toMatchObject({ code: "youtube_channel_response_invalid" });
  });

  it.each([undefined, ""])("fails closed when the uploads playlist is %s", async (uploads) => {
    const item = {
      id: "UC0", snippet: { title: "Channel 0" },
      contentDetails: { relatedPlaylists: { uploads } },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item] }), { status: 200 }));
    await expect(new GoogleYouTubeOAuthProvider(config, fetcher).ownedChannels("access-secret"))
      .rejects.toMatchObject({ code: "youtube_channel_response_invalid" });
  });
});
