import "server-only";
import {
  getAvTransportControl,
  setAvUri,
  setNextAvUri,
  avPlay,
  getCurrentUri,
  type AvTrack,
} from "./avtransport";

/**
 * In-process NAS play queue per device. UPnP AVTransport only holds a current +
 * one "next" URI, so a lightweight interval keeps the next track loaded as the
 * album advances — giving gapless, ordered, whole-album playback that starts at
 * the first track. Ephemeral (lost on restart), like the sleep-timer registry.
 * Also the source of truth for the (proxied) cover art shown in Now Playing —
 * the device reports the NAS art host, which the device art route can't fetch.
 */

interface Queue {
  host: string;
  ctrl: string;
  tracks: AvTrack[];
  index: number; // current track
  prepared: number; // index whose "next" we've already loaded
  timer: ReturnType<typeof setInterval> | null;
}

const queues = new Map<string, Queue>(); // deviceId -> queue
const ADVANCE_MS = 9000;

export interface NasQueueArt {
  art: string | null; // raw NAS albumArtURI of the current track
}

/** The current track's raw art URL for a device's active queue, if any. */
export function getNasQueueArt(deviceId: string): NasQueueArt | null {
  const q = queues.get(deviceId);
  if (!q) return null;
  const cur = q.tracks[Math.min(q.index, q.tracks.length - 1)];
  return { art: cur?.art ?? null };
}

export function stopNasQueue(deviceId: string): void {
  const q = queues.get(deviceId);
  if (q?.timer) clearInterval(q.timer);
  queues.delete(deviceId);
}

/** Start playing `tracks` in order from the first, keeping the queue advancing. */
export async function startNasQueue(deviceId: string, host: string, tracks: AvTrack[]): Promise<void> {
  stopNasQueue(deviceId);
  const ctrl = await getAvTransportControl(host);
  await setAvUri(host, ctrl, tracks[0]!);
  await avPlay(host, ctrl);
  const q: Queue = { host, ctrl, tracks, index: 0, prepared: -1, timer: null };
  queues.set(deviceId, q);
  await prepareNext(q);
  if (tracks.length > 1) {
    q.timer = setInterval(() => {
      void advance(deviceId).catch(() => {});
    }, ADVANCE_MS);
  }
}

async function prepareNext(q: Queue): Promise<void> {
  if (q.prepared === q.index) return; // already queued the next for this track
  const next = q.tracks[q.index + 1];
  if (next) await setNextAvUri(q.host, q.ctrl, next);
  q.prepared = q.index;
}

/** Poll the renderer; when it has advanced, load the following track as "next". */
async function advance(deviceId: string): Promise<void> {
  const q = queues.get(deviceId);
  if (!q) return;
  let cur: string;
  try {
    cur = await getCurrentUri(q.host, q.ctrl);
  } catch {
    return; // transient — try again next tick
  }
  if (!cur) return; // between tracks / unknown — don't tear down on a blank read
  const i = q.tracks.findIndex((t) => sameUri(t.res, cur));
  if (i === -1) {
    stopNasQueue(deviceId); // user switched to another source — stop managing
    return;
  }
  if (i !== q.index) q.index = i;
  await prepareNext(q);
}

/** URIs can come back with trivial escaping differences; compare tolerantly. */
function sameUri(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return decodeURI(a) === decodeURI(b);
  } catch {
    return false;
  }
}
