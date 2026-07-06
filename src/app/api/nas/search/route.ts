import { NextResponse } from "next/server";
import { guard, apiError, json } from "@/lib/api";
import { searchLibrary } from "@/lib/dlna/contentdirectory";
import { DlnaError, dlnaErrorStatus } from "@/lib/dlna/transport";

export const dynamic = "force-dynamic";

/** Rewrite a NAS art URI to the /api/nas/art proxy (browser never hits the NAS). */
function artProxy(uri: string | null): string | null {
  return uri ? `/api/nas/art?url=${encodeURIComponent(uri)}` : null;
}

/**
 * Whole-library name search via the ContentDirectory Search action: containers
 * (folders/albums/artists…) and audio tracks whose title contains `q`. Track
 * hits carry their parent container id so the play route can select them by
 * item id (see /api/devices/[id]/nas/play `trackId`).
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 256);
  if (q.length < 2) return apiError(400, "Search needs at least 2 characters", "QUERY_TOO_SHORT");

  try {
    const { folders, tracks } = await searchLibrary(q);
    return json({
      folders: folders.map((f) => ({ id: f.id, title: f.title, art: artProxy(f.albumArtUri) })),
      tracks: tracks.map((t) => ({
        id: t.id,
        parentId: t.parentId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        art: artProxy(t.albumArtUri),
      })),
    });
  } catch (e) {
    if (e instanceof DlnaError && e.code === "SOAP_FAULT") {
      return apiError(422, "The media server does not support search", "SEARCH_UNSUPPORTED");
    }
    if (e instanceof DlnaError) return apiError(dlnaErrorStatus(e.code), e.message, e.code);
    const msg = e instanceof Error ? e.message : "Search failed";
    return apiError(502, msg, "DLNA");
  }
}
