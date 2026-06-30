import { NextResponse } from "next/server";
import { guard, apiError, json } from "@/lib/api";
import { searchAlbums } from "@/lib/dlna/contentdirectory";
import { DlnaError, dlnaErrorStatus } from "@/lib/dlna/transport";

export const dynamic = "force-dynamic";

/**
 * List every musicAlbum on the configured DLNA media server. Album art URIs are
 * rewritten to the /api/nas/art proxy so the browser never talks to the NAS
 * directly. Doubles as the Settings "Test connection" probe.
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;

  try {
    const albums = await searchAlbums();
    return json({
      albums: albums.map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        art: a.albumArtUri ? `/api/nas/art?url=${encodeURIComponent(a.albumArtUri)}` : null,
      })),
    });
  } catch (e) {
    if (e instanceof DlnaError) return apiError(dlnaErrorStatus(e.code), e.message, e.code);
    const msg = e instanceof Error ? e.message : "Browse failed";
    return apiError(502, msg, "DLNA");
  }
}
