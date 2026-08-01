# ADR 0007: Keep YouTube OAuth server-side with an encrypted token vault

- Status: Accepted
- Date: 2026-08-02

## Decision

YouTube channel connection uses Google's web-server authorization-code flow and requests exactly `https://www.googleapis.com/auth/youtube.readonly`. The browser receives only Google's authorization URL. The authorization code, access token, refresh token, client secret, encrypted credential envelope, and revocation token remain server-only.

An authorization request requires an already approved `channel_action`. Its opaque random state is stored only as a SHA-256 hash, bound by the database to the authenticated user and workspace, expires after ten minutes, and can be consumed once. Callback completion fails closed on missing, expired, replayed, cross-user, or cross-workspace state.

Refresh and revocation use short database leases. A refresh-token `invalid_grant` changes connection status to `reconnect_required`; it is never retried as a transient failure. Revocation is completed at Google before local credentials are marked revoked. Audit events must contain safe action/status metadata only.

Credentials use AES-256-GCM authenticated encryption. The envelope records a key version, and old keys may be configured decrypt-only during rotation. Keys are deployment secrets, not database values.

## Required database contract

Authenticated, security-definer RPCs:

- `create_youtube_oauth_state(workspace, approval, state_hash, expires_at)` verifies membership and an approved `channel_action` for that workspace.
- `consume_youtube_oauth_state(state_hash)` atomically sets `consumed_at` and returns the bound `workspace_id` and `user_id`; it rejects replay, expiry, and identity/workspace mismatch.
- `store_youtube_connection(..., state_hash)` atomically verifies the exact consumed state is not already completed, marks it completed, upserts safe channel metadata plus the private encrypted credential envelope, and appends an audit event.

Service-role-only RPCs:

- `lease_youtube_token_refresh`, `complete_youtube_token_refresh`, `mark_youtube_reconnect_required`.
- `lease_youtube_revocation` verifies a separate approved `channel_action`; `complete_youtube_revocation` erases the private token envelope after Google succeeds.

Private connection rows and OAuth-state rows must not be selectable through browser RLS roles. Lease completion must compare both workspace and lease token atomically.

## Deployment configuration

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `YOUTUBE_REDIRECT_URI` (must exactly match the Google Console redirect URI)
- `YOUTUBE_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64 encoded)
- `YOUTUBE_TOKEN_ENCRYPTION_KEY_VERSION` (for example `v1`)
- `YOUTUBE_TOKEN_DECRYPTION_KEYS` (optional JSON map of old version to base64 key during rotation)

No live Google credentials or calls are used by normal CI. Production connection remains blocked until the database contract, Google consent screen, exact redirect URI, secret installation, and revocation/reconnect runbook have been verified.

## References

- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [YouTube Data API scopes](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [OAuth token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
