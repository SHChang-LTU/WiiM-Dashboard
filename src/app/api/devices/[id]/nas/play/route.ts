import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, apiError, json } from "@/lib/api";
import { parseBody } from "@/lib/validate";
import { resolveDevice } from "@/lib/device-route";
import { albumTracks } from "@/lib/dlna/contentdirectory";
import { startNasQueue } from "@/lib/dlna/nas-queue";
import { DlnaError, dlnaErrorStatus } from "@/lib/dlna/transport";
import { WiimError } from "@/lib/wiim/client";
import type { AvTrack } from "@/lib/dlna/avtransport";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  object: z.string().trim().min(1).max(1024),
  // Optional subset of the container's tracks, by their position in the folder
  // listing. Omitted → play the whole container, in order.
  indices: z.array(z.number().int().min(0).max(100000)).max(2000).optional(),
  // Alternative selector: one track by its ContentDirectory item id within
  // `object` (its parent container). Used by whole-library search hits, whose
  // position in the parent is unknown to the client. Takes precedence.
  trackId: z.string().trim().min(1).max(1024).optional(),
  // Album/folder name for the tracks' DIDL metadata (shown as the album in Now
  // Playing). Track title/artist/art come from the server-side browse.
  meta: z.object({ album: z.string().max(512) }).optional(),
});

/**
 * Play a NAS folder/album (or a selection) on the device via UPnP AVTransport.
 * We drive the renderer directly (SetAVTransportURI + Play, then keep the "next"
 * URI loaded as it advances) rather than pushing an httpapi playlist, because
 * that firmware path ignores the start index and resumes at a stale cursor. This
 * plays from the first track, in order, with native metadata + cover art.
 */
export async function POST(req: Request, { params }: Params) {
  const g = await guard(req, { mutation: true });
  if (g instanceof NextResponse) return g;
  const r = resolveDevice((await params).id);
  if ("res" in r) return r.res;

  const parsed = await parseBody(req, Schema);
  if (!parsed.ok) return parsed.res;

  const album = parsed.data.meta?.album ?? "";

  try {
    const all = await albumTracks(parsed.data.object);
    const chosen = parsed.data.trackId
      ? all.filter((t) => t.id === parsed.data.trackId)
      : parsed.data.indices
        ? parsed.data.indices.map((i) => all[i]).filter((t): t is (typeof all)[number] => t != null)
        : all;
    if (chosen.length === 0) return apiError(404, "No playable tracks", "NO_TRACKS");

    const queue: AvTrack[] = chosen.map((t) => ({
      res: t.res,
      title: t.title,
      artist: t.artist,
      album,
      art: t.albumArtUri,
      duration: t.duration,
    }));

    await startNasQueue(r.device.id, r.device.host, queue);
    return json({ ok: true, tracks: queue.length });
  } catch (e) {
    if (e instanceof DlnaError) return apiError(dlnaErrorStatus(e.code), e.message, e.code);
    if (e instanceof WiimError) return apiError(502, e.message, e.code);
    const msg = e instanceof Error ? e.message : "Playback failed";
    return apiError(502, msg, "PLAYBACK");
  }
}
