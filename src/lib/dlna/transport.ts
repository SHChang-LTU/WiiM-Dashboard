import "server-only";
import http from "node:http";
import https from "node:https";
import { resolveTarget, pinnedLookup } from "@/lib/wiim/client";
import { getDlna } from "@/lib/db/settings";

/**
 * Plain-HTTP UPnP/DLNA transport to the NAS media server on the LAN.
 *
 * Unlike the WiiM transport this does NOT present the LinkPlay mTLS client cert
 * — DLNA servers speak ordinary HTTP SOAP. It reuses the WiiM SSRF guard:
 *  - the URL host is resolved and the connection is PINNED to that IP (no DNS
 *    rebind between check and connect);
 *  - the resolved IP must be private (LAN); and
 *  - the host must match the configured media server (parsed from descUrl), so
 *    this can't be pivoted to other internal hosts / cloud metadata.
 */

export class DlnaError extends Error {
  code: string;
  constructor(message: string, code = "DLNA_ERROR") {
    super(message);
    this.name = "DlnaError";
    this.code = code;
  }
}

/** Map a DlnaError code to an HTTP status for API routes. */
export function dlnaErrorStatus(code?: string): number {
  switch (code) {
    case "NOT_CONFIGURED":
    case "FORBIDDEN_HOST":
      return 400;
    case "TIMEOUT":
      return 504;
    default:
      return 502;
  }
}

/** Hostname of the configured media server (from the description-XML URL). */
export function getMediaHost(): string {
  const descUrl = getDlna().descUrl.trim();
  if (!descUrl) throw new DlnaError("Media server not configured", "NOT_CONFIGURED");
  try {
    return new URL(descUrl).hostname;
  } catch {
    throw new DlnaError("Invalid media server URL", "NOT_CONFIGURED");
  }
}

export interface DlnaResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  text: string;
}

interface DlnaFetchOpts {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * Fetch a URL on the configured media server. Enforces the SSRF policy above
 * before connecting. Used for the description XML, SOAP control calls, and
 * album art — every byte the DLNA client reads goes through here.
 */
export async function dlnaFetch(url: string, opts: DlnaFetchOpts = {}): Promise<DlnaResponse> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DlnaError(`Invalid URL: ${url}`, "BAD_URL");
  }
  const mediaHost = getMediaHost();
  if (u.hostname.toLowerCase() !== mediaHost.toLowerCase()) {
    throw new DlnaError(`Refusing host outside media server: ${u.hostname}`, "FORBIDDEN_HOST");
  }
  const target = await resolveTarget(u.hostname);
  if (!target.isPrivate) {
    throw new DlnaError(`Refusing non-LAN media target: ${u.hostname} (${target.ip})`, "FORBIDDEN_HOST");
  }

  const method = opts.method ?? "GET";
  const timeoutMs = opts.timeoutMs ?? 8000;
  const isHttp = u.protocol === "http:";
  const lib = isHttp ? http : https;
  const bodyBuf = opts.body != null ? Buffer.from(opts.body, "utf8") : undefined;

  return new Promise<DlnaResponse>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const reqOpts: https.RequestOptions = {
      host: u.hostname,
      port: u.port || (isHttp ? 80 : 443),
      path: u.pathname + u.search,
      method,
      signal: controller.signal,
      headers: {
        "User-Agent": "wiim-dashboard",
        ...opts.headers,
        ...(bodyBuf ? { "Content-Length": String(bodyBuf.length) } : {}),
      },
    };
    // A NAS serving art over https is almost always self-signed; verification is
    // already moot on the trusted LAN and the connection is pinned to the IP.
    if (!isHttp) (reqOpts as https.RequestOptions).rejectUnauthorized = false;
    if (!target.isLiteral) reqOpts.lookup = pinnedLookup(target.ip, target.family);

    const req = lib.request(reqOpts, (res: http.IncomingMessage) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > 10_000_000) {
          controller.abort();
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
          text: body.toString("utf8"),
        });
      });
    });
    req.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const code = err.name === "AbortError" ? "TIMEOUT" : err.code || "NETWORK";
      reject(new DlnaError(`Media request to ${u.hostname} failed: ${err.message}`, code));
    });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}
