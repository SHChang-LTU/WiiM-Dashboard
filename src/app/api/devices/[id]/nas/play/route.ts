import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, apiError } from "@/lib/api";
import { parseBody } from "@/lib/validate";
import { resolveDevice, runDevice } from "@/lib/device-route";
import { playUrlList } from "@/lib/wiim/commands";
import { signM3uToken } from "@/lib/dlna/token";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({ object: z.string().trim().min(1).max(1024) });

/**
 * The LAN-reachable base URL the device should fetch the m3u from. Prefer the
 * explicit MEDIA_CALLBACK_ORIGIN; otherwise derive it from the inbound request
 * (correct when the user is browsing over the LAN IP). This is the most common
 * point of failure for reverse-proxy setups — hence the override.
 */
function callbackOrigin(req: Request): string | null {
  if (config.mediaCallbackOrigin) return config.mediaCallbackOrigin;
  const host = req.headers.get("host");
  if (!host) return null;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}

/** Play a NAS album: host a signed m3u of its tracks, point the device at it. */
export async function POST(req: Request, { params }: Params) {
  const g = await guard(req, { mutation: true });
  if (g instanceof NextResponse) return g;
  const r = resolveDevice((await params).id);
  if ("res" in r) return r.res;

  const parsed = await parseBody(req, Schema);
  if (!parsed.ok) return parsed.res;

  const origin = callbackOrigin(req);
  if (!origin) return apiError(400, "Cannot determine callback origin", "NO_CALLBACK_ORIGIN");

  const token = signM3uToken(parsed.data.object);
  const m3uUrl = `${origin}/api/nas/m3u?token=${token}`;

  return runDevice(() => playUrlList(r.device.host, m3uUrl, 0));
}
