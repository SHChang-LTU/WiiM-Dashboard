import "server-only";
import http from "node:http";
import { resolveTarget, pinnedLookup, WiimError } from "@/lib/wiim/client";

/**
 * Minimal UPnP AVTransport:1 control-point for the WiiM device's own MediaRenderer
 * (plain HTTP on port 49152, no mTLS). We drive playback through this instead of
 * the httpapi `setPlayerCmd:playlist` push because that firmware path ignores the
 * start index and resumes at a stale playlist cursor. AVTransport plays the exact
 * URI we set — from the start — and, with DIDL metadata, the device reports real
 * title/artist/album/art natively (getPlayerStatusEx / getMetaInfo).
 *
 * SSRF: the device host comes from our DB; the IP is resolved, checked private,
 * and the connection pinned (shared with the WiiM/DLNA transports).
 */

const UPNP_PORT = 49152;
const AVT = "urn:schemas-upnp-org:service:AVTransport:1";

/** One playable track, as handed to the renderer. */
export interface AvTrack {
  res: string; // stream URL on the NAS
  title: string | null;
  artist: string | null;
  album: string;
  art: string | null; // raw NAS albumArtURI
  duration: number | null; // seconds
}

const ctrlCache = new Map<string, string>(); // deviceHost -> AVTransport control URL

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** DLNA protocolInfo MIME guessed from the file extension; wildcard fallback. */
function mimeOf(res: string): string {
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(res)?.[1]?.toLowerCase();
  const map: Record<string, string> = {
    flac: "audio/flac", wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4",
    aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", aif: "audio/aiff",
    aiff: "audio/aiff", wma: "audio/x-ms-wma", alac: "audio/mp4", dsf: "audio/dsd",
  };
  return (ext && map[ext]) || "audio/mpeg";
}

/** "0:03:45" from seconds, for the DIDL res@duration attribute. */
function hms(secs: number | null): string {
  if (secs == null || secs < 0) return "0:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** DIDL-Lite metadata for one track so the renderer shows real names + art. */
function didl(t: AvTrack): string {
  const parts = [
    `<dc:title>${xmlEsc(t.title ?? "Track")}</dc:title>`,
    t.artist ? `<dc:creator>${xmlEsc(t.artist)}</dc:creator>` : "",
    t.artist ? `<upnp:artist>${xmlEsc(t.artist)}</upnp:artist>` : "",
    t.album ? `<upnp:album>${xmlEsc(t.album)}</upnp:album>` : "",
    t.art ? `<upnp:albumArtURI>${xmlEsc(t.art)}</upnp:albumArtURI>` : "",
    `<upnp:class>object.item.audioItem.musicTrack</upnp:class>`,
    `<res protocolInfo="http-get:*:${mimeOf(t.res)}:*" duration="${hms(t.duration)}">${xmlEsc(t.res)}</res>`,
  ];
  return (
    `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">` +
    `<item id="0" parentID="0" restricted="1">${parts.join("")}</item></DIDL-Lite>`
  );
}

async function request(
  host: string,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<{ status: number; text: string }> {
  const target = await resolveTarget(host);
  if (!target.isPrivate) {
    throw new WiimError(`Refusing non-LAN device target: ${host} (${target.ip})`, "FORBIDDEN_HOST");
  }
  const bodyBuf = opts.body != null ? Buffer.from(opts.body, "utf8") : undefined;
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    const reqOpts: http.RequestOptions = {
      host,
      port: UPNP_PORT,
      path,
      method: opts.method ?? "GET",
      signal: controller.signal,
      headers: { ...opts.headers, ...(bodyBuf ? { "Content-Length": String(bodyBuf.length) } : {}) },
    };
    if (!target.isLiteral) reqOpts.lookup = pinnedLookup(target.ip, target.family);
    const req = http.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const code = err.name === "AbortError" ? "TIMEOUT" : err.code || "NETWORK";
      reject(new WiimError(`AVTransport request to ${host} failed: ${err.message}`, code));
    });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function soap(host: string, ctrl: string, action: string, inner: string): Promise<string> {
  const path = new URL(ctrl).pathname;
  const env =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${AVT}"><InstanceID>0</InstanceID>${inner}</u:${action}></s:Body></s:Envelope>`;
  const res = await request(host, path, {
    method: "POST",
    headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPACTION: `"${AVT}#${action}"` },
    body: env,
  });
  if (res.status >= 400) throw new WiimError(`AVTransport ${action} returned HTTP ${res.status}`, "AVTRANSPORT");
  return res.text;
}

/** Resolve (and cache) the device's AVTransport control URL from its UPnP description. */
export async function getAvTransportControl(host: string): Promise<string> {
  const cached = ctrlCache.get(host);
  if (cached) return cached;
  const desc = await request(host, "/description.xml", { method: "GET" });
  if (desc.status >= 400) throw new WiimError(`Device description HTTP ${desc.status}`, "AVTRANSPORT");
  for (const svc of desc.text.match(/<service\b[\s\S]*?<\/service>/gi) ?? []) {
    if (/AVTransport/i.test(svc)) {
      const c = /<controlURL>([\s\S]*?)<\/controlURL>/i.exec(svc)?.[1]?.trim();
      if (c) {
        const url = new URL(c, `http://${host}:${UPNP_PORT}/`).toString();
        ctrlCache.set(host, url);
        return url;
      }
    }
  }
  throw new WiimError("Device exposes no AVTransport service", "AVTRANSPORT");
}

export async function setAvUri(host: string, ctrl: string, t: AvTrack): Promise<void> {
  await soap(host, ctrl, "SetAVTransportURI", `<CurrentURI>${xmlEsc(t.res)}</CurrentURI><CurrentURIMetaData>${xmlEsc(didl(t))}</CurrentURIMetaData>`);
}

export async function setNextAvUri(host: string, ctrl: string, t: AvTrack): Promise<void> {
  await soap(host, ctrl, "SetNextAVTransportURI", `<NextURI>${xmlEsc(t.res)}</NextURI><NextURIMetaData>${xmlEsc(didl(t))}</NextURIMetaData>`);
}

export async function avPlay(host: string, ctrl: string): Promise<void> {
  await soap(host, ctrl, "Play", `<Speed>1</Speed>`);
}

/** The URI the renderer is currently playing (for the queue advancer). */
export async function getCurrentUri(host: string, ctrl: string): Promise<string> {
  const text = await soap(host, ctrl, "GetPositionInfo", "");
  return decodeEntities(/<TrackURI>([\s\S]*?)<\/TrackURI>/i.exec(text)?.[1]?.trim() ?? "");
}
