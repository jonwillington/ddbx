import type { Env } from "../index";
import type { Analysis } from "../db/types";
import type { Session, DailySummaryDealing } from "./twitter";

const SITE_BASE = "https://ddbx.uk";

// APNs endpoints
const APNS_PROD = "https://api.push.apple.com";
const APNS_SANDBOX = "https://api.sandbox.push.apple.com";

// ---- JWT for APNs (ES256 via Web Crypto) ------------------------------------

/** Build a short-lived JWT for Apple Push Notification service. */
async function buildApnsJwt(env: Env): Promise<string> {
  const header = { alg: "ES256", kid: env.APNS_KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: env.APNS_TEAM_ID, iat: now };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = enc(header);
  const claimsB64 = enc(claims);
  const signingInput = `${headerB64}.${claimsB64}`;

  const key = await importApnsKey(env.APNS_PRIVATE_KEY);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  // Web Crypto returns DER-encoded signature; APNs expects raw r||s (64 bytes)
  const rawSig = derToRaw(new Uint8Array(sig));
  const sigB64 = uint8ToB64Url(rawSig);

  return `${signingInput}.${sigB64}`;
}

/** Import a PEM-encoded P8 private key for ES256 signing. */
async function importApnsKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Convert DER-encoded ECDSA signature to raw r||s (64 bytes). */
function derToRaw(der: Uint8Array): Uint8Array {
  // Some Web Crypto implementations return raw 64 bytes directly.
  if (der.length === 64) return der;

  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  let offset = 2; // skip 0x30 + total length
  // r
  offset += 1; // 0x02
  const rLen = der[offset++];
  const r = der.slice(offset, offset + rLen);
  offset += rLen;
  // s
  offset += 1; // 0x02
  const sLen = der[offset++];
  const s = der.slice(offset, offset + sLen);

  const raw = new Uint8Array(64);
  raw.set(r.length > 32 ? r.slice(r.length - 32) : r, 32 - Math.min(r.length, 32));
  raw.set(s.length > 32 ? s.slice(s.length - 32) : s, 64 - Math.min(s.length, 32));
  return raw;
}

function uint8ToB64Url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---- Send push --------------------------------------------------------------

interface PushPayload {
  id: string;
  ticker: string;
  company: string;
  analysis: Analysis;
}

function buildApnsPayload(p: PushPayload): object {
  const cleanCompany = p.company.replace(/\s*\([^)]*\)\s*$/, "");
  const displayTicker = p.ticker.replace(/\.L$/, "");
  const ratingLabel = p.analysis.rating.charAt(0).toUpperCase() + p.analysis.rating.slice(1);

  return {
    aps: {
      alert: {
        title: `${ratingLabel}: ${displayTicker} · ${cleanCompany}`,
        body: p.analysis.summary,
      },
      sound: "default",
      "thread-id": "dealing-alerts",
      "mutable-content": 1,
    },
    dealing_id: p.id,
    url: `${SITE_BASE}/dealings/${p.id}`,
  };
}

/** Send a push notification to registered device tokens whose notify_level matches the rating. */
export async function sendPushNotifications(
  env: Env,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  // Noteworthy+ → 'noteworthy' and 'all'; lower ratings → 'all' only. 'none' never receives deal pushes.
  const isHighTier = payload.analysis.rating === "significant" || payload.analysis.rating === "noteworthy";
  const rows = isHighTier
    ? await env.DB.prepare(
        `SELECT token, environment FROM device_tokens WHERE active = 1 AND notify_level IN ('noteworthy', 'all')`,
      ).all<{ token: string; environment: string }>()
    : await env.DB.prepare(
        `SELECT token, environment FROM device_tokens WHERE active = 1 AND notify_level = 'all'`,
      ).all<{ token: string; environment: string }>();

  if (rows.results.length === 0) {
    console.log(`[apns] no eligible devices (rating=${payload.analysis.rating}), skipping push for ${payload.id}`);
    return { sent: 0, failed: 0 };
  }

  const jwt = await buildApnsJwt(env);
  const body = JSON.stringify(buildApnsPayload(payload));
  const bundleId = env.APNS_BUNDLE_ID ?? "uk.ddbx.app";

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    rows.results.map(async (device) => {
      const host = device.environment === "production" ? APNS_PROD : APNS_SANDBOX;
      const url = `${host}/3/device/${device.token}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `bearer ${jwt}`,
            "apns-topic": bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "Content-Type": "application/json",
          },
          body,
        });

        if (res.ok) {
          sent++;
        } else {
          const detail = await res.text().catch(() => "");
          console.error(`[apns] ${res.status} for token ${device.token.slice(0, 8)}…: ${detail}`);

          // Deactivate invalid tokens (410 Gone = unregistered, 400 BadDeviceToken)
          if (res.status === 410 || (res.status === 400 && detail.includes("BadDeviceToken"))) {
            await env.DB.prepare(
              `UPDATE device_tokens SET active = 0 WHERE token = ?1`,
            ).bind(device.token).run();
          }
          failed++;
        }
      } catch (err) {
        console.error(`[apns] error for token ${device.token.slice(0, 8)}…: ${(err as Error).message}`);
        failed++;
      }
    }),
  );

  console.log(`[apns] dealing ${payload.id}: sent=${sent} failed=${failed} total=${rows.results.length}`);
  return { sent, failed };
}

// ---- Daily digest push (morning / close) ------------------------------------

function formatGbp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "£0";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `£${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${Math.round(value)}`;
}

function buildDigestPayload(p: {
  date: string;
  session: Session;
  dealings: DailySummaryDealing[];
}): object | null {
  const total = p.dealings.length;
  if (total === 0) return null;

  const noteworthy = p.dealings.filter(
    (d) => d.rating === "significant" || d.rating === "noteworthy",
  ).length;

  const totalValue = p.dealings.reduce((sum, d) => sum + d.value_gbp, 0);
  const sessionLabel = p.session === "morning" ? "Morning" : "Close";
  const tradeWord = total === 1 ? "trade" : "trades";

  // Top 3 by value for the body
  const top = [...p.dealings]
    .sort((a, b) => b.value_gbp - a.value_gbp)
    .slice(0, 3);
  const topLine = top
    .map((d) => `${d.ticker.replace(/\.L$/, "")} ${formatGbp(d.value_gbp)}`)
    .join(" · ");

  let body = `${topLine}`;
  if (total > 3) body += ` + ${total - 3} more`;
  if (noteworthy > 0) {
    body += `\n${noteworthy} rated noteworthy or above`;
  }

  return {
    aps: {
      alert: {
        title: `📊 ${sessionLabel} · ${total} ${tradeWord} · ${formatGbp(totalValue)}`,
        body,
      },
      sound: "default",
      "thread-id": "daily-digest",
    },
    type: "digest",
    date: p.date,
    session: p.session,
    url: SITE_BASE,
  };
}

/** Send a daily digest push notification to all registered devices. */
export async function sendDigestPush(
  env: Env,
  p: { date: string; session: Session; dealings: DailySummaryDealing[] },
): Promise<{ sent: number; failed: number }> {
  const payload = buildDigestPayload(p);
  if (!payload) {
    console.log(`[apns] no dealings for digest ${p.date} ${p.session}, skipping`);
    return { sent: 0, failed: 0 };
  }

  return broadcastPush(env, payload, `digest-${p.date}-${p.session}`);
}

// ---- Shared broadcast -------------------------------------------------------

/** Send an arbitrary APNs payload to devices that have daily summaries enabled. */
async function broadcastPush(
  env: Env,
  payload: object,
  label: string,
): Promise<{ sent: number; failed: number }> {
  const rows = await env.DB.prepare(
    `SELECT token, environment FROM device_tokens WHERE active = 1 AND digest_enabled = 1`,
  ).all<{ token: string; environment: string }>();

  if (rows.results.length === 0) {
    console.log(`[apns] no registered devices for ${label}`);
    return { sent: 0, failed: 0 };
  }

  const jwt = await buildApnsJwt(env);
  const body = JSON.stringify(payload);
  const bundleId = env.APNS_BUNDLE_ID ?? "uk.ddbx.app";

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    rows.results.map(async (device) => {
      const host = device.environment === "production" ? APNS_PROD : APNS_SANDBOX;
      const url = `${host}/3/device/${device.token}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `bearer ${jwt}`,
            "apns-topic": bundleId,
            "apns-push-type": "alert",
            "apns-priority": "5",
            "Content-Type": "application/json",
          },
          body,
        });

        if (res.ok) {
          sent++;
        } else {
          const detail = await res.text().catch(() => "");
          console.error(`[apns] ${label} ${res.status} for ${device.token.slice(0, 8)}…: ${detail}`);
          if (res.status === 410 || (res.status === 400 && detail.includes("BadDeviceToken"))) {
            await env.DB.prepare(
              `UPDATE device_tokens SET active = 0 WHERE token = ?1`,
            ).bind(device.token).run();
          }
          failed++;
        }
      } catch (err) {
        console.error(`[apns] ${label} error: ${(err as Error).message}`);
        failed++;
      }
    }),
  );

  console.log(`[apns] ${label}: sent=${sent} failed=${failed} total=${rows.results.length}`);
  return { sent, failed };
}
