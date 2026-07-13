// Stateless magic-link tokens. A token carries the submission id + an expiry and is
// signed with HMAC-SHA256, so email confirmation needs no server-side token table.
// A reused link stays valid until it expires (idempotent confirm); true single-use
// is a hardening follow-up.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenPayload {
  sid: string; // submission id
  exp: number; // epoch seconds
}

const b64url = (buf: Buffer | string): string =>
  (typeof buf === "string" ? Buffer.from(buf, "utf8") : buf).toString("base64url");

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Serialize + sign a payload into a `body.sig` token string. */
export function makeToken(payload: TokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Verify signature + expiry. Returns the payload, or null if tampered/expired/malformed. */
export function verifyToken(token: string, secret: string, nowSeconds: number = Math.floor(Date.now() / 1000)): TokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload?.sid !== "string" || typeof payload?.exp !== "number") return null;
  if (payload.exp < nowSeconds) return null;
  return payload;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24h

function requireSecret(): string {
  const secret = process.env.MAGIC_LINK_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("MAGIC_LINK_SECRET is missing or too short (need 16+ chars).");
  }
  return secret;
}

/** Build the full magic-link URL for a submission (reads secret + app URL from env). */
export function magicLinkFor(submissionId: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = makeToken({ sid: submissionId, exp }, requireSecret());
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/confirm?token=${encodeURIComponent(token)}`;
}

/** Verify a token from a magic link using the env secret. */
export function verifyMagicLink(token: string): TokenPayload | null {
  return verifyToken(token, requireSecret());
}

const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d — how long a confirmed report stays viewable

/** Signed value for the httpOnly `report_access` cookie set after email confirmation. */
export function makeAccessToken(submissionId: string): string {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;
  return makeToken({ sid: submissionId, exp }, requireSecret());
}

/** Verify a `report_access` cookie value; returns the payload or null. */
export function verifyAccessToken(token: string): TokenPayload | null {
  return verifyToken(token, requireSecret());
}
