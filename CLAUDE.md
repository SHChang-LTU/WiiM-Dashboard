# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server with hot reload → http://localhost:3000
npm run build        # production standalone build
npm run start        # run the production build
npm run typecheck    # tsc --noEmit
npm run lint         # Next.js ESLint
./scripts/release.sh patch   # bump version, tag, push, publish GitHub release (or: minor | major | 1.2.3)
```

There is **no test suite**. The gate before a PR is `npm run typecheck && npm run build` — both must pass. Exercising device features requires a real WiiM device on the LAN (add it by IP from the Add device page).

`package.json` is the single source of truth for the version — it's injected at build time via `next.config.ts` (`env.APP_VERSION`) and shown in the footer. Don't hand-edit version strings elsewhere.

## What this is

A single Next.js 15 (App Router) app that is **both** the UI and a server-side proxy to WiiM (LinkPlay) audio devices on the LAN. The browser never contacts a device directly — the WiiM HTTP API has no auth and a self-signed cert, so all device traffic goes through SSRF-guarded, mTLS Route Handlers. Persistence is `better-sqlite3` (WAL). Dark-only, mobile-first, packaged as one Docker container behind a reverse proxy.

## Architecture

Read `ARCHITECTURE.md` for the full picture. The request lifecycle:

1. **`src/middleware.ts`** (edge runtime, no DB): per-request CSP nonce, security headers, and a cookie-presence page gate that redirects to `/login`. The real auth check is server-side.
2. **Route handler** (`src/app/api/.../route.ts`, Node runtime): calls `guard(req, { mutation })` from `src/lib/api.ts` — requires a valid session, and for mutations verifies the CSRF double-submit token + Origin.
3. **Validation**: request bodies parsed with Zod (`src/lib/validate.ts`).
4. **Device call**: resolve the device from SQLite (`resolveDevice` in `src/lib/device-route.ts`), then call a typed function in `src/lib/wiim/commands.ts`, wrapped in `runDevice()` which maps `WiimError` codes to HTTP statuses.
5. **Transport** (`src/lib/wiim/client.ts`): resolves host → IP, **verifies it's a LAN address (SSRF guard)**, pins the connection to that IP, sends `httpapi.asp` over HTTPS with the shared LinkPlay client cert.
6. **Parsing** (`src/lib/wiim/parse.ts`): tolerant JSON parse, hex/HTML-entity decode, enum mapping → typed shapes in `src/lib/wiim/types.ts`.

### Server-only vs client boundary

Everything under `src/lib/wiim`, `src/lib/dlna`, `src/lib/auth`, `src/lib/db`, `src/lib/lastfm`, `src/lib/scrobble`, `src/lib/sleep`, `src/lib/lyrics` is **server-only** (marked `import "server-only"`). Never import them into client components. Browser-side code lives in `src/lib/client/` — `api.ts` (fetch wrapper injecting the CSRF header from the cookie) and `hooks.ts` (SWR hooks `useDevices`, `useSettings`, `useSnapshot`).

### Live dashboard data flow

The dashboard calls `useSnapshot(deviceId, intervalMs)` (default 3 s) → `GET /api/devices/[id]/snapshot` → `getDeviceSnapshot` (`src/lib/wiim/snapshot.ts`), one poll = a parallel `Promise.allSettled` of device info, player status, metadata, and (gated on cached `DeviceCapabilities`) sub-out/output/EQ/presets. Cards in `src/components/dashboard/` render conditionally from snapshot + capabilities. Mutations POST then call SWR `mutate()` to refresh.

Capabilities are **probed once** on add/refresh (`src/lib/wiim/capabilities.ts`) and cached on the device row so the poll loop doesn't re-probe.

### Background jobs (live in the Node process, survive a closed browser)

- **Last.fm scrobbler** (`src/lib/scrobble/poller.ts`): started from `src/instrumentation.ts` `register()` on boot (Node runtime only), with a lazy idempotent fallback in the snapshot route; `globalThis` guards double-start. Polls every 15 s; sends `updateNowPlaying` on track change and `scrobble` once Last.fm eligibility is met. **Last.fm returns HTTP 200 even when it silently drops a scrobble** — the poller inspects `scrobbles.@attr.ignored` and logs the real outcome instead of a false success. "Love" uses `track.love`/`unlove` because the WiiM API has no native favorite command.
- **Sleep timer** (`src/lib/sleep/timer.ts`): in-process per-device registry that schedules a `pause`; the snapshot exposes the expiry for a live countdown. Managed via `/api/devices/[id]/sleep`.

### NAS / DLNA library (`src/lib/dlna/`)

**This feature requires a separate, reachable UPnP/DLNA media server on the LAN** (e.g. Universal Media Server, MinimServer, or a NAS's built-in server) — the app is a client, not a server, and does not index media itself. It's opt-in and gated: you enter the server's device-description XML URL as `descUrl` in Settings (`getDlna`/`setDlna` in `src/lib/db/settings.ts`), and the dashboard's Library entry point stays hidden until that's set. None of the core WiiM device controls depend on this; it's only for browsing and playing your own library.

UPnP client for browsing a media server's folders/albums (`contentdirectory.ts`, resolving the ContentDirectory control URL via `description.ts`) and playing them. The DIDL-Lite parser is deliberately regex-tolerant (servers vary), mirroring `wiim/parse.ts`. Browsing is folder-by-folder — `GET /api/nas/list?object=<id>` returns sub-folders + tracks — and album art is proxied through `/api/nas/art` so the browser never talks to the NAS.

**Whole-library search crawls the tree via Browse — do not switch it to the UPnP `Search` action.** Many servers (Universal Media Server included) don't index folder shares for `Search`, so `GET /api/nas/search?q=` → `searchLibrary()` in `contentdirectory.ts` matches against an in-memory index built by a breadth-first `Browse` crawl from the root, bounded by concurrency (20), container count (20 000) and a 45 s time budget (a partial index is returned if exceeded; the redundant UMS "Media Library" subtree is skipped). The index is cached in-process for 30 min with concurrent first-searches coalesced; results are capped at 500 folders + 500 tracks. In the browse dialog the same input live-filters the current folder client-side; Enter triggers the server-side library search.

**Playback is driven over UPnP AVTransport, not the httpapi.** The WiiM's `setPlayerCmd:playlist` push ignores the start index and resumes a stale playlist cursor (starting mid-album), so the play route (`/api/devices/[id]/nas/play`) drives the device's own MediaRenderer directly (`avtransport.ts`). It plays a whole folder, selected `indices`, or a single search hit by ContentDirectory item id via `trackId` (which takes precedence over `indices`): `SetAVTransportURI` + `Play` on the first track, then a per-device advancer (`nas-queue.ts`, a background job) keeps the next track loaded via `SetNextAVTransportURI` as the album plays through. This starts at track 1, in order, and — because the DIDL carries full metadata — the device reports real title/artist/album natively (the advancer is also the source of the proxied cover art in the snapshot).

## Conventions

- **TypeScript strict.** Avoid `any`; prefer the shared types in `src/lib/wiim/types.ts`.
- **Validate every request body** with Zod (`parseBody`). Allowlist enum-like inputs (sources, outputs, EQ presets).
- **Every mutating route calls `guard(req, { mutation: true })`**; read-only routes call `guard(req)`.
- **All device access goes through `src/lib/wiim`** so it inherits the SSRF guard + mTLS. Never build an `httpapi.asp` URL by hand in a route.
- **Styling:** Tailwind + the `cn()` helper (`src/lib/utils.ts`). Reuse `ui/` primitives and `Card`/`CardHeader`. Mobile-first, dark-only.
- **Commits:** imperative, scoped (e.g. `feat(presets): show artwork`, `fix(csp): drop upgrade-insecure-requests over http`).

## Adding things (from CONTRIBUTING.md)

- **New device control:** add a command builder in `wiim/constants.ts` (`Cmd`) + a typed function in `wiim/commands.ts` (check the response with `assertAccepted`) → route `guard({mutation:true})` → `resolveDevice` → `parseBody` → `runDevice(() => yourCommand(...))` → call from client via `apiSend(...)` then `mutate()`.
- **New dashboard card:** add live state to `DeviceSnapshot` (`types.ts`) and fetch it in `snapshot.ts` (gated on a capability) → add a capability flag in `capabilities.ts` if model-dependent → create `src/components/dashboard/<feature>-card.tsx` → render it gated in `dashboard.tsx`.
- **New WiiM command/field:** verify against the official PDF, `python-linkplay`, `pywiim`; document in `docs/WIIM-API.md` marking **documented** vs **community-verified**; map enums in `constants.ts`, parse in `parse.ts`.

## Environment & deployment

Configure via `.env` (copy from `.env.example`). Key vars: `AUTH_SECRET` (required; keys sessions + CSRF), and `COOKIE_SECURE=false` for plain-http LAN dev — which also disables HSTS and the CSP `upgrade-insecure-requests` so scripts/styles load over http.

Deploy is a multi-stage `Dockerfile` → Next.js standalone server. Native modules (`better-sqlite3`, `@node-rs/argon2`) are kept external and copied explicitly. The entrypoint fixes data-dir ownership (so a bind-mount works) then drops to non-root uid 1001 via `gosu`. SQLite + config persist in the `wiim-data` volume.
