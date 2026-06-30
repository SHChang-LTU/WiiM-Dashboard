import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

/**
 * Short-lived HMAC token authorising the (otherwise unauthenticated) m3u route.
 * The WiiM device fetches the m3u with no session/CSRF, so the album object id
 * is carried INSIDE a signed token (not as a query param) and expires quickly.
 * Keyed by AUTH_SECRET, exactly like session tokens (db/sessions.ts).
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", config.authSecret).update(payload).digest("base64url");
}

/** Sign `{ object, exp }`; returns "<payload>.<sig>" (URL-safe, no specials). */
export function signM3uToken(object: string, ttlMs = DEFAULT_TTL_MS): string {
  const payload = Buffer.from(
    JSON.stringify({ o: object, e: Date.now() + ttlMs }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verify signature + expiry; returns the album object id or null. */
export function verifyM3uToken(token: string): { object: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      o?: unknown;
      e?: unknown;
    };
    if (typeof data.o !== "string" || typeof data.e !== "number") return null;
    if (Date.now() > data.e) return null;
    return { object: data.o };
  } catch {
    return null;
  }
}
