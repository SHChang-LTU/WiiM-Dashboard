import "server-only";
import type { Track } from "./contentdirectory";

/**
 * Build an Extended M3U playlist the WiiM device fetches and plays. Each track
 * is one #EXTINF line (duration + label) followed by its stream URL on the NAS.
 */
export function buildM3u(tracks: Track[]): string {
  const lines = ["#EXTM3U"];
  for (const t of tracks) {
    const secs = t.duration ?? -1;
    const label =
      [t.artist, t.title].filter(Boolean).join(" - ") || t.title || "Track";
    // Strip newlines so a hostile/odd title can't inject extra playlist lines.
    lines.push(`#EXTINF:${secs},${label.replace(/[\r\n]+/g, " ")}`);
    lines.push(t.res);
  }
  return lines.join("\n") + "\n";
}
