import "server-only";
import { dlnaFetch, DlnaError } from "./transport";
import { getContentDirectory } from "./description";

/**
 * UPnP ContentDirectory:1 client. Two operations the dashboard needs:
 *  - searchAlbums(): every musicAlbum on the server (Search, with a shallow
 *    Browse fallback when the server doesn't implement Search);
 *  - albumTracks(): the ordered tracks of one album.
 *
 * Servers vary, so the DIDL-Lite parser is deliberately tolerant (regex over
 * the XML rather than a strict DOM), mirroring the style of wiim/parse.ts.
 */

const CD_SERVICE = "urn:schemas-upnp-org:service:ContentDirectory:1";
const ALBUM_CLASS = "object.container.album.musicAlbum";
/** Bound memory / response size — large libraries are paginated up to this. */
const MAX_RESULTS = 2000;
const PAGE_SIZE = 200;

export interface Album {
  id: string;
  title: string;
  artist: string | null;
  albumArtUri: string | null;
}

export interface Track {
  id: string | null;
  title: string | null;
  artist: string | null;
  albumArtUri: string | null;
  res: string;
  duration: number | null;
}

/** A navigable container (folder, album, artist, genre…) in the tree. */
export interface Folder {
  id: string;
  title: string;
  albumArtUri: string | null;
}

/** One track as shown in a folder listing (no stream URL — that stays server-side). */
export interface FolderTrack {
  id: string | null;
  title: string | null;
  artist: string | null;
  albumArtUri: string | null;
  duration: number | null;
}

/** Direct children of one container: sub-folders + playable tracks, in server order. */
export interface FolderListing {
  folders: Folder[];
  tracks: FolderTrack[];
}

/** One track hit from a whole-library Search (playable via parent container + item id). */
export interface SearchTrack {
  id: string | null;
  parentId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtUri: string | null;
  duration: number | null;
}

/** Whole-library name-search results: matching containers + matching tracks. */
export interface LibrarySearch {
  folders: Folder[];
  tracks: SearchTrack[];
}

// --- XML helpers -------------------------------------------------------------

/** Decode the XML/HTML entities DIDL payloads carry (e.g. "&amp;" → "&"). */
function decodeXml(s: string): string {
  if (!s.includes("&")) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCode(parseInt(d, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&amp;/gi, "&"); // last, so "&amp;lt;" → "&lt;" → "<"
}

function fromCode(n: number): string {
  try {
    return Number.isFinite(n) ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

function tag(block: string, name: string): string | null {
  // name may be namespaced (dc:title, upnp:albumArtURI) — ":" is regex-safe.
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(block);
  return m ? decodeXml(m[1]!.trim()) : null;
}

function attr(openTag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(openTag);
  return m ? decodeXml(m[1]!) : null;
}

/** "0:03:45.000" or "0:03:45" → seconds; null when absent/unparseable. */
function parseDuration(d: string | null): number | null {
  if (!d) return null;
  const m = /(\d+):(\d{1,2}):(\d{1,2})(?:\.\d+)?/.exec(d);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function absolute(uri: string | null, base: string): string | null {
  if (!uri) return null;
  try {
    return new URL(uri, base).toString();
  } catch {
    return null;
  }
}

// --- SOAP --------------------------------------------------------------------

function soapEnvelope(action: string, inner: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Body><u:${action} xmlns:u="${CD_SERVICE}">${inner}</u:${action}></s:Body>` +
    `</s:Envelope>`
  );
}

/** One Browse/Search page. Returns the inner (decoded) DIDL plus TotalMatches. */
async function soapCall(
  action: "Browse" | "Search",
  inner: string,
): Promise<{ didl: string; total: number; returned: number }> {
  const cd = await getContentDirectory();
  const res = await dlnaFetch(cd.controlURL, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPACTION: `"${CD_SERVICE}#${action}"`,
    },
    body: soapEnvelope(action, inner),
    timeoutMs: 8000,
  });
  if (res.status >= 400) {
    // A SOAP fault (often 500) on Search means "unsupported" to our caller.
    throw new DlnaError(`${action} returned HTTP ${res.status}`, "SOAP_FAULT");
  }
  const resultRaw = /<Result>([\s\S]*?)<\/Result>/i.exec(res.text);
  const didl = resultRaw ? decodeXml(resultRaw[1]!) : "";
  const total = Number(/<TotalMatches>(\d+)<\/TotalMatches>/i.exec(res.text)?.[1] ?? "0");
  const returned = Number(/<NumberReturned>(\d+)<\/NumberReturned>/i.exec(res.text)?.[1] ?? "0");
  return { didl, total, returned };
}

// --- DIDL parsing ------------------------------------------------------------

function blocks(didl: string, kind: "container" | "item"): string[] {
  return didl.match(new RegExp(`<${kind}\\b[\\s\\S]*?</${kind}>`, "gi")) ?? [];
}

function openTagOf(block: string, kind: string): string {
  const m = new RegExp(`<${kind}\\b[^>]*>`, "i").exec(block);
  return m ? m[0] : "";
}

function parseAlbum(block: string, base: string): Album | null {
  const id = attr(openTagOf(block, "container"), "id");
  const title = tag(block, "dc:title");
  if (!id || !title) return null;
  return {
    id,
    title,
    artist: tag(block, "upnp:artist") ?? tag(block, "dc:creator"),
    albumArtUri: absolute(tag(block, "upnp:albumArtURI"), base),
  };
}

/**
 * Is this <item> an audio track (vs. cover art / video the server also exposes
 * as items)? Prefer upnp:class; fall back to the res MIME. Unknown-both-ways is
 * accepted so an under-tagged server never hides real music.
 */
function isAudioItem(block: string, resOpenTag: string): boolean {
  const cls = (tag(block, "upnp:class") ?? "").toLowerCase();
  if (cls.includes("audioitem")) return true;
  if (cls.includes("imageitem") || cls.includes("videoitem")) return false;
  const proto = (attr(resOpenTag, "protocolInfo") ?? "").toLowerCase();
  if (proto.includes(":audio/")) return true;
  if (proto.includes(":image/") || proto.includes(":video/")) return false;
  return true;
}

function parseTrack(block: string, base: string): Track | null {
  const resOpen = /<res\b[^>]*>([\s\S]*?)<\/res>/i.exec(block);
  const res = absolute(resOpen ? decodeXml(resOpen[1]!.trim()) : null, base);
  if (!res) return null; // a track with no stream URL is useless to us
  if (!isAudioItem(block, resOpen ? resOpen[0] : "")) return null; // skip cover art / video items
  return {
    id: attr(openTagOf(block, "item"), "id"),
    title: tag(block, "dc:title"),
    artist: tag(block, "upnp:artist") ?? tag(block, "dc:creator"),
    albumArtUri: absolute(tag(block, "upnp:albumArtURI"), base),
    res,
    duration: parseDuration(resOpen ? attr(resOpen[0], "duration") : null),
  };
}

/** Any navigable <container> child — a folder, album, artist bucket, etc. */
function parseFolder(block: string, base: string): Folder | null {
  const id = attr(openTagOf(block, "container"), "id");
  const title = tag(block, "dc:title");
  if (!id || !title) return null;
  return { id, title, albumArtUri: absolute(tag(block, "upnp:albumArtURI"), base) };
}

/**
 * An audio <item> encountered while crawling. `res` is not required — a hit is
 * played via its parent container + item id. Falls back to the parent container's
 * id/title for parentId and album when the DIDL omits them.
 */
function parseCrawlTrack(
  block: string,
  base: string,
  parent: { id: string; title: string },
): SearchTrack | null {
  const open = openTagOf(block, "item");
  const resOpen = /<res\b[^>]*>/i.exec(block);
  if (!isAudioItem(block, resOpen ? resOpen[0] : "")) return null;
  const title = tag(block, "dc:title");
  if (!title) return null;
  return {
    id: attr(open, "id"),
    parentId: attr(open, "parentID") ?? parent.id,
    title,
    artist: tag(block, "upnp:artist") ?? tag(block, "dc:creator"),
    album: tag(block, "upnp:album") ?? (parent.title || null),
    albumArtUri: absolute(tag(block, "upnp:albumArtURI"), base),
    duration: parseDuration(resOpen ? attr(resOpen[0], "duration") : null),
  };
}

// --- public API --------------------------------------------------------------

/** All musicAlbum containers on the server, via Search with a Browse fallback. */
export async function searchAlbums(): Promise<Album[]> {
  const cd = await getContentDirectory();
  try {
    const viaSearch = await searchAlbumsViaSearch(cd.base);
    if (viaSearch.length > 0) return viaSearch;
    // Empty result: some servers reply HTTP 200 with no <Result> instead of a
    // fault when Search is unsupported — try the shallow browse before giving up.
    return await browseAlbumsShallow(cd.base);
  } catch (e) {
    if (e instanceof DlnaError && (e.code === "SOAP_FAULT" || e.code === "TIMEOUT")) {
      // Server doesn't implement Search (UPnP fault) — fall back to a browse.
      return browseAlbumsShallow(cd.base);
    }
    throw e;
  }
}

async function searchAlbumsViaSearch(base: string): Promise<Album[]> {
  const albums: Album[] = [];
  for (let start = 0; start < MAX_RESULTS; start += PAGE_SIZE) {
    const inner =
      `<ContainerID>0</ContainerID>` +
      `<SearchCriteria>upnp:class derivedfrom "${ALBUM_CLASS}"</SearchCriteria>` +
      `<Filter>*</Filter>` +
      `<StartingIndex>${start}</StartingIndex>` +
      `<RequestedCount>${PAGE_SIZE}</RequestedCount>` +
      `<SortCriteria></SortCriteria>`;
    const { didl, returned } = await soapCall("Search", inner);
    const found = blocks(didl, "container")
      .map((b) => parseAlbum(b, base))
      .filter((a): a is Album => a !== null);
    albums.push(...found);
    if (returned < PAGE_SIZE || found.length === 0) break;
  }
  return dedupe(albums);
}

/** Fallback: browse root children up to 2 levels, collecting musicAlbum containers. */
async function browseAlbumsShallow(base: string): Promise<Album[]> {
  const albums: Album[] = [];
  const seenContainers = new Set<string>();

  async function childrenOf(objectId: string): Promise<string[]> {
    const inner =
      `<ObjectID>${objectId}</ObjectID>` +
      `<BrowseFlag>BrowseDirectChildren</BrowseFlag>` +
      `<Filter>*</Filter>` +
      `<StartingIndex>0</StartingIndex>` +
      `<RequestedCount>${PAGE_SIZE}</RequestedCount>` +
      `<SortCriteria></SortCriteria>`;
    const { didl } = await soapCall("Browse", inner);
    const out: string[] = [];
    for (const b of blocks(didl, "container")) {
      const cls = tag(b, "upnp:class") ?? "";
      if (cls.includes(ALBUM_CLASS)) {
        const album = parseAlbum(b, base);
        if (album) albums.push(album);
      } else {
        const id = attr(openTagOf(b, "container"), "id");
        if (id) out.push(id);
      }
    }
    return out;
  }

  const level1 = await childrenOf("0");
  for (const id of level1) {
    if (albums.length >= MAX_RESULTS || seenContainers.has(id)) continue;
    seenContainers.add(id);
    await childrenOf(id);
  }
  return dedupe(albums);
}

function dedupe(albums: Album[]): Album[] {
  const byId = new Map<string, Album>();
  for (const a of albums) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()];
}

/** Cap the number of matches returned per kind. */
const SEARCH_CAP = 500;

/**
 * Whole-library search index, built by crawling the ContentDirectory with Browse
 * and cached in-process. We crawl rather than use the UPnP Search action because
 * some servers (notably Universal Media Server) only index part of the tree for
 * Search — folder shares are browsable but invisible to Search — so Search
 * silently misses tracks. Browsing the tree ourselves sees everything the user
 * can navigate to, and lets us match case-insensitively.
 */
interface LibraryIndex {
  folders: Folder[];
  tracks: SearchTrack[];
}

const INDEX_TTL_MS = 30 * 60 * 1000; // rebuild at most once per 30 min
const CRAWL_CONCURRENCY = 20; // parallel Browse calls (each is ~20ms on a LAN server)
const CRAWL_MAX_CONTAINERS = 20_000; // safety bound for pathological trees
const CRAWL_BUDGET_MS = 45_000; // stop (return a partial index) past this

/**
 * Containers NOT to descend into. UMS (and similar) expose a "Media Library" node
 * that re-lists every file across By-Album/By-Artist/By-Date views — a 5-10×
 * redundant, slow-to-browse duplicate of the real folder shares (and each copy
 * gets a distinct object id, so it can't even be deduped). The folder shares hold
 * the same tracks and browse fast, so we skip this subtree. The node itself is
 * still recorded as a folder so its name is searchable.
 */
const SKIP_SUBTREE_TITLES = new Set(["media library"]);

let indexCache: { index: LibraryIndex; expires: number } | null = null;
let indexInFlight: Promise<LibraryIndex> | null = null;

/** Cached, deduped flat index of every folder + audio track reachable by Browse. */
async function getLibraryIndex(): Promise<LibraryIndex> {
  if (indexCache && indexCache.expires > Date.now()) return indexCache.index;
  if (indexInFlight) return indexInFlight; // coalesce concurrent first-searches
  indexInFlight = crawlLibrary()
    .then((index) => {
      indexCache = { index, expires: Date.now() + INDEX_TTL_MS };
      return index;
    })
    .finally(() => {
      indexInFlight = null;
    });
  return indexInFlight;
}

/** Breadth-first crawl of the whole tree, deduped by object id, bounded. */
async function crawlLibrary(): Promise<LibraryIndex> {
  const cd = await getContentDirectory();
  const folders: Folder[] = [];
  const tracks: SearchTrack[] = [];
  const seenContainers = new Set<string>(["0"]);
  const seenFolders = new Set<string>();
  const seenTracks = new Set<string>();
  const startedAt = Date.now();

  // The root browse is intentionally not wrapped: an unreachable server should
  // surface as an error, not a silently-empty index.
  let frontier = await crawlContainer({ id: "0", title: "" }, cd.base, folders, tracks, seenFolders, seenTracks);

  while (frontier.length > 0) {
    if (seenContainers.size >= CRAWL_MAX_CONTAINERS || Date.now() - startedAt > CRAWL_BUDGET_MS) break;
    const batch = frontier.splice(0, CRAWL_CONCURRENCY);
    const subs = await Promise.all(
      batch.map(async (node) => {
        if (seenContainers.has(node.id)) return [];
        seenContainers.add(node.id);
        try {
          return await crawlContainer(node, cd.base, folders, tracks, seenFolders, seenTracks);
        } catch {
          return []; // one unreachable container shouldn't abort the whole crawl
        }
      }),
    );
    for (const s of subs) frontier.push(...s);
  }
  return { folders, tracks };
}

/** Browse every page of one container; collect its folders + audio tracks, return new sub-containers. */
async function crawlContainer(
  node: { id: string; title: string },
  base: string,
  folders: Folder[],
  tracks: SearchTrack[],
  seenFolders: Set<string>,
  seenTracks: Set<string>,
): Promise<{ id: string; title: string }[]> {
  const subs: { id: string; title: string }[] = [];
  for (let start = 0; start < MAX_RESULTS; start += PAGE_SIZE) {
    const inner =
      `<ObjectID>${escapeXml(node.id)}</ObjectID>` +
      `<BrowseFlag>BrowseDirectChildren</BrowseFlag>` +
      `<Filter>*</Filter>` +
      `<StartingIndex>${start}</StartingIndex>` +
      `<RequestedCount>${PAGE_SIZE}</RequestedCount>` +
      `<SortCriteria></SortCriteria>`;
    const { didl, returned } = await soapCall("Browse", inner);
    for (const b of blocks(didl, "container")) {
      const f = parseFolder(b, base);
      if (!f || seenFolders.has(f.id)) continue;
      seenFolders.add(f.id);
      folders.push(f);
      if (!SKIP_SUBTREE_TITLES.has(f.title.trim().toLowerCase())) subs.push({ id: f.id, title: f.title });
    }
    for (const b of blocks(didl, "item")) {
      const t = parseCrawlTrack(b, base, node);
      if (!t) continue;
      // UMS re-lists the same file across Media Library views — dedupe by id.
      const key = t.id ?? `${node.id}:${t.title}`;
      if (seenTracks.has(key)) continue;
      seenTracks.add(key);
      tracks.push(t);
    }
    if (returned < PAGE_SIZE) break;
  }
  return subs;
}

/**
 * Whole-library name search over the cached crawl index: folders/albums by title,
 * tracks by title or artist, case-insensitive. The first call after the cache
 * expires pays the crawl cost; subsequent calls are instant.
 */
export async function searchLibrary(query: string): Promise<LibrarySearch> {
  const q = query.trim().toLowerCase();
  if (!q) return { folders: [], tracks: [] };
  const index = await getLibraryIndex();
  const folders = index.folders.filter((f) => f.title.toLowerCase().includes(q)).slice(0, SEARCH_CAP);
  const tracks = index.tracks
    .filter((t) => (t.title ?? "").toLowerCase().includes(q) || (t.artist ?? "").toLowerCase().includes(q))
    .slice(0, SEARCH_CAP);
  return { folders, tracks };
}

/** Ordered tracks of one album container. */
export async function albumTracks(albumId: string): Promise<Track[]> {
  const cd = await getContentDirectory();
  const tracks: Track[] = [];
  for (let start = 0; start < MAX_RESULTS; start += PAGE_SIZE) {
    const inner =
      `<ObjectID>${escapeXml(albumId)}</ObjectID>` +
      `<BrowseFlag>BrowseDirectChildren</BrowseFlag>` +
      `<Filter>*</Filter>` +
      `<StartingIndex>${start}</StartingIndex>` +
      `<RequestedCount>${PAGE_SIZE}</RequestedCount>` +
      `<SortCriteria></SortCriteria>`;
    const { didl, returned } = await soapCall("Browse", inner);
    const found = blocks(didl, "item")
      .map((b) => parseTrack(b, cd.base))
      .filter((t): t is Track => t !== null);
    tracks.push(...found);
    if (returned < PAGE_SIZE) break;
  }
  return tracks;
}

/**
 * Direct children of one container: its sub-folders and its playable tracks, in
 * server order. Tracks are parsed identically to (and in the same order as)
 * `albumTracks`, so a track's position here is a stable index the play route can
 * use to re-select it from the container — no need to ship stream URLs to the
 * browser or stuff object IDs into the m3u token.
 */
export async function browseFolder(objectId: string): Promise<FolderListing> {
  const cd = await getContentDirectory();
  const folders: Folder[] = [];
  const tracks: FolderTrack[] = [];
  for (let start = 0; start < MAX_RESULTS; start += PAGE_SIZE) {
    const inner =
      `<ObjectID>${escapeXml(objectId)}</ObjectID>` +
      `<BrowseFlag>BrowseDirectChildren</BrowseFlag>` +
      `<Filter>*</Filter>` +
      `<StartingIndex>${start}</StartingIndex>` +
      `<RequestedCount>${PAGE_SIZE}</RequestedCount>` +
      `<SortCriteria></SortCriteria>`;
    const { didl, returned } = await soapCall("Browse", inner);
    for (const b of blocks(didl, "container")) {
      const f = parseFolder(b, cd.base);
      if (f) folders.push(f);
    }
    for (const b of blocks(didl, "item")) {
      const t = parseTrack(b, cd.base);
      if (t) {
        tracks.push({
          id: t.id,
          title: t.title,
          artist: t.artist,
          albumArtUri: t.albumArtUri,
          duration: t.duration,
        });
      }
    }
    if (returned < PAGE_SIZE) break;
  }
  return { folders, tracks };
}

/** Escape a value placed in element text (object IDs can contain & < >). */
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
