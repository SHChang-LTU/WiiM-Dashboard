import { NextResponse } from "next/server";
import { guard, apiError, json } from "@/lib/api";
import { browseFolder } from "@/lib/dlna/contentdirectory";
import { DlnaError, dlnaErrorStatus } from "@/lib/dlna/transport";

export const dynamic = "force-dynamic";

/** Rewrite a NAS art URI to the /api/nas/art proxy (browser never hits the NAS). */
function artProxy(uri: string | null): string | null {
  return uri ? `/api/nas/art?url=${encodeURIComponent(uri)}` : null;
}

/**
 * Browse the direct children of one ContentDirectory container: its sub-folders
 * and playable tracks. `object` is the container id ("0" = root). Tracks are
 * returned in server order; a track's array position is the index the play route
 * uses to select it (see /api/devices/[id]/nas/play).
 */
export async function GET(req: Request) {
  const g = await guard(req);
  if (g instanceof NextResponse) return g;

  const object = (new URL(req.url).searchParams.get("object") || "0").slice(0, 1024);

  try {
    const { folders, tracks } = await browseFolder(object);
    return json({
      folders: folders.map((f) => ({ id: f.id, title: f.title, art: artProxy(f.albumArtUri) })),
      tracks: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        art: artProxy(t.albumArtUri),
      })),
    });
  } catch (e) {
    if (e instanceof DlnaError) return apiError(dlnaErrorStatus(e.code), e.message, e.code);
    const msg = e instanceof Error ? e.message : "Browse failed";
    return apiError(502, msg, "DLNA");
  }
}
