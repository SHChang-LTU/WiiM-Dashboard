import { verifyM3uToken } from "@/lib/dlna/token";
import { albumTracks } from "@/lib/dlna/contentdirectory";
import { buildM3u } from "@/lib/dlna/m3u";

export const dynamic = "force-dynamic";

/**
 * Serve the m3u playlist the WiiM device fetches. DELIBERATELY UNAUTHENTICATED:
 * the device has no session/CSRF. Access is gated entirely by a short-TTL HMAC
 * token (signed in the play route) whose payload carries the album object id —
 * so this only ever emits the user's own LAN track URLs, and only for ~5 min.
 * Reachable because middleware never gates /api (src/middleware.ts).
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const verified = verifyM3uToken(token);
  if (!verified) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const tracks = await albumTracks(verified.object);
    return new Response(buildM3u(tracks), {
      headers: { "content-type": "audio/x-mpegurl", "cache-control": "no-store" },
    });
  } catch {
    return new Response("Playlist unavailable", { status: 502 });
  }
}
