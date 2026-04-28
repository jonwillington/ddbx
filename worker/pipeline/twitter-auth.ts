// X (Twitter) OAuth 2.0 user-context auth — confidential client with PKCE.
//
// Flow:
//   1. /__twitter-auth/start  → buildAuthorizeUrl writes a PKCE verifier+state
//      pair into kv keyed by `twitter:pkce:<state>`, redirects user to X.
//   2. X redirects back to /__twitter-auth/callback with `code` + `state`.
//      handleAuthCallback exchanges the code for an access+refresh token pair
//      using Basic auth (client_id:client_secret) and persists both under
//      `twitter:tokens` along with `expires_at` (ISO).
//   3. sendTweet calls getAccessToken which returns the cached access token
//      if still valid (>=60s of life left), otherwise calls refreshAccessToken
//      which exchanges the refresh_token for a new access+refresh pair and
//      writes them back to `twitter:tokens`. X rotates refresh tokens on every
//      exchange, so persisting the new one is mandatory.
//
// Required secrets (`wrangler secret put`):
//   TWITTER_CLIENT_ID
//   TWITTER_CLIENT_SECRET
//
// Required scopes when authorising: tweet.read tweet.write users.read offline.access
// `offline.access` is what makes X return a refresh_token at all.

const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];
const TOKENS_KEY = "twitter:tokens";
const PKCE_KEY_PREFIX = "twitter:pkce:";
// Refresh slightly before X actually expires the token so two near-simultaneous
// crons don't both see "still valid" then race a 401.
const EXPIRY_SKEW_SECONDS = 60;

export interface TwitterAuthEnv {
  DB: D1Database;
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601
}

interface PkceState {
  code_verifier: string;
  redirect_uri: string;
  created_at: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// ---- kv helpers ----------------------------------------------------------

async function kvGet(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM kv WHERE key = ?1")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function kvPut(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value)
    .run();
}

async function kvDelete(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM kv WHERE key = ?1").bind(key).run();
}

// ---- PKCE helpers --------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafe(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// ---- public API ----------------------------------------------------------

export async function buildAuthorizeUrl(
  env: TwitterAuthEnv,
  redirectUri: string,
): Promise<string> {
  const state = randomUrlSafe(16);
  const codeVerifier = randomUrlSafe(48); // 64 chars after base64url
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const pkce: PkceState = {
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.DB, PKCE_KEY_PREFIX + state, JSON.stringify(pkce));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.TWITTER_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function handleAuthCallback(
  env: TwitterAuthEnv,
  code: string,
  state: string,
): Promise<{ scope: string | null }> {
  const raw = await kvGet(env.DB, PKCE_KEY_PREFIX + state);
  if (!raw) throw new Error("unknown or expired oauth state");
  const pkce = JSON.parse(raw) as PkceState;
  // PKCE state is single-use.
  await kvDelete(env.DB, PKCE_KEY_PREFIX + state);

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: env.TWITTER_CLIENT_ID,
    redirect_uri: pkce.redirect_uri,
    code_verifier: pkce.code_verifier,
  });
  const tokens = await tokenRequest(env, body);
  if (!tokens.refresh_token) {
    throw new Error(
      "X did not return a refresh_token — make sure offline.access is in your app's scopes",
    );
  }
  await persistTokens(env, tokens);
  return { scope: tokens.scope ?? null };
}

export async function getAccessToken(env: TwitterAuthEnv): Promise<string> {
  const stored = await loadTokens(env);
  if (!stored) {
    throw new Error(
      "no twitter tokens stored — visit /__twitter-auth/start to bootstrap",
    );
  }
  const expiresAt = Date.parse(stored.expires_at);
  const now = Date.now();
  if (Number.isFinite(expiresAt) && expiresAt - EXPIRY_SKEW_SECONDS * 1000 > now) {
    return stored.access_token;
  }
  return refreshAccessToken(env);
}

export async function refreshAccessToken(env: TwitterAuthEnv): Promise<string> {
  const stored = await loadTokens(env);
  if (!stored?.refresh_token) {
    throw new Error(
      "no refresh_token stored — re-bootstrap via /__twitter-auth/start",
    );
  }
  const body = new URLSearchParams({
    refresh_token: stored.refresh_token,
    grant_type: "refresh_token",
    client_id: env.TWITTER_CLIENT_ID,
  });
  const tokens = await tokenRequest(env, body);
  // X rotates refresh tokens on every exchange; if it ever omits one, fall
  // back to the previous so we don't lock ourselves out.
  const next: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
  await kvPut(env.DB, TOKENS_KEY, JSON.stringify(next));
  return next.access_token;
}

// ---- internals -----------------------------------------------------------

async function loadTokens(env: TwitterAuthEnv): Promise<StoredTokens | null> {
  const raw = await kvGet(env.DB, TOKENS_KEY);
  return raw ? (JSON.parse(raw) as StoredTokens) : null;
}

async function persistTokens(
  env: TwitterAuthEnv,
  tokens: TokenResponse,
): Promise<void> {
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token!,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
  await kvPut(env.DB, TOKENS_KEY, JSON.stringify(stored));
}

async function tokenRequest(
  env: TwitterAuthEnv,
  body: URLSearchParams,
): Promise<TokenResponse> {
  const basic = btoa(`${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`twitter token endpoint ${res.status}: ${detail}`);
  }
  return (await res.json()) as TokenResponse;
}
