import "server-only";
import { getDlna } from "@/lib/db/settings";
import { dlnaFetch, DlnaError } from "./transport";

/**
 * Resolve the ContentDirectory:1 control URL from the media server's device
 * description XML. The result is cached in-process keyed by the configured
 * descUrl, so changing the setting transparently invalidates the cache.
 */

export interface ContentDirectory {
  controlURL: string;
  /** Origin to resolve relative DIDL res/art URLs against. */
  base: string;
}

let cache: { descUrl: string; cd: ContentDirectory } | null = null;

function firstMatch(re: RegExp, s: string): string | null {
  const m = re.exec(s);
  return m ? m[1]!.trim() : null;
}

/** Pull the ContentDirectory service's <controlURL> out of the description XML. */
function extractControlUrl(xml: string): string | null {
  // Each service is a <service>…</service> block; pick the one whose
  // serviceType names ContentDirectory, then read its controlURL.
  const services = xml.match(/<service\b[\s\S]*?<\/service>/gi) ?? [];
  for (const svc of services) {
    if (/ContentDirectory/i.test(svc)) {
      const url = firstMatch(/<controlURL>([\s\S]*?)<\/controlURL>/i, svc);
      if (url) return url;
    }
  }
  return null;
}

export async function getContentDirectory(): Promise<ContentDirectory> {
  const descUrl = getDlna().descUrl.trim();
  if (!descUrl) throw new DlnaError("Media server not configured", "NOT_CONFIGURED");
  if (cache && cache.descUrl === descUrl) return cache.cd;

  const res = await dlnaFetch(descUrl, { method: "GET", timeoutMs: 7000 });
  if (res.status >= 400) {
    throw new DlnaError(`Description fetch returned HTTP ${res.status}`, "HTTP");
  }
  const xml = res.text;
  const controlPath = extractControlUrl(xml);
  if (!controlPath) {
    throw new DlnaError("No ContentDirectory service in description", "NO_CONTENT_DIRECTORY");
  }
  // controlURL and relative res/art URLs resolve against <URLBase> if present,
  // otherwise the description URL itself.
  const urlBase = firstMatch(/<URLBase>([\s\S]*?)<\/URLBase>/i, xml) || descUrl;
  let controlURL: string;
  try {
    controlURL = new URL(controlPath, urlBase).toString();
  } catch {
    throw new DlnaError("Bad ContentDirectory control URL", "NO_CONTENT_DIRECTORY");
  }
  const cd: ContentDirectory = { controlURL, base: new URL(controlURL).origin };
  cache = { descUrl, cd };
  return cd;
}
