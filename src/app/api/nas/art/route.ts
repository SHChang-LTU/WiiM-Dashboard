import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { dlnaFetch } from "@/lib/dlna/transport";

export const dynamic = "force-dynamic";

const TRANSPARENT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
function fallback(): Response {
  return new Response(TRANSPARENT, {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=60" },
  });
}

function serveImage(body: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(body), {
    headers: { "content-type": contentType, "cache-control": "private, max-age=3600" },
  });
}

/** Detect an image MIME type from leading magic bytes (some DLNA servers mislabel art). */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return null;
}

// Server-side cache so art is instant on every load and the NAS is hit at most
// once per image per hour. Keyed by the (validated) source URL.
const artCache = new Map<string, { at: number; body: Buffer; contentType: string }>();
const ART_TTL_MS = 60 * 60 * 1000;

/** Proxy DLNA album art. The URL must resolve to the configured media server
 *  (enforced by dlnaFetch), so this can't be turned into an open proxy. */
export async function GET(req: Request) {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;

  const url = new URL(req.url).searchParams.get("url");
  if (!url) return fallback();

  const hit = artCache.get(url);
  if (hit && Date.now() - hit.at < ART_TTL_MS) return serveImage(hit.body, hit.contentType);

  try {
    const res = await dlnaFetch(url, { method: "GET", timeoutMs: 7000 });
    if (res.status >= 400 || res.body.length === 0) return fallback();
    let contentType = (res.headers["content-type"] as string) || "";
    if (!contentType.startsWith("image/")) {
      contentType = sniffImageType(res.body) ?? "";
      if (!contentType) return fallback();
    }
    if (artCache.size > 300) artCache.clear();
    artCache.set(url, { at: Date.now(), body: res.body, contentType });
    return serveImage(res.body, contentType);
  } catch {
    return fallback();
  }
}
