"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Check, ChevronRight, Folder, Home, ListMusic, Music, Play, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { apiGet, apiSend, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Folder = { id: string; title: string; art: string | null };
type Track = {
  id: string | null;
  title: string | null;
  artist: string | null;
  duration: number | null;
  art: string | null;
};
type Listing = { folders: Folder[]; tracks: Track[] };
type SearchTrack = {
  id: string | null;
  parentId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  art: string | null;
};
type SearchListing = { folders: Folder[]; tracks: SearchTrack[] };
type Crumb = { id: string; title: string; art: string | null };

const ROOT: Crumb = { id: "0", title: "Library", art: null };

function fmtDur(secs: number | null): string {
  if (secs == null || secs < 0) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BrowseDialog({
  deviceId,
  open,
  onOpenChange,
  onPlayed,
}: {
  deviceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlayed: () => void;
}) {
  const toast = useToast();
  // Drag is initiated only from the header handle (dragListener is off), so the
  // scroll area, folders and tracks keep their normal pointer behaviour.
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  const [stack, setStack] = useState<Crumb[]>([ROOT]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searchQ, setSearchQ] = useState(""); // submitted whole-library search term
  const current = stack[stack.length - 1]!;

  // Start every open back at the root with a clean selection.
  useEffect(() => {
    if (open) {
      setStack([ROOT]);
      setSelected(new Set());
      setQuery("");
      setSearchQ("");
    }
  }, [open]);

  const { data, error, isLoading } = useSWR<Listing>(
    open ? ["nas-list", current.id] : null,
    (k: string[]) => apiGet<Listing>(`/api/nas/list?object=${encodeURIComponent(k[1]!)}`),
    { revalidateOnFocus: false },
  );
  const folders = data?.folders ?? [];
  const tracks = data?.tracks ?? [];

  // Whole-library search (server-side UPnP Search) runs when a term is submitted
  // (Enter / the "Search entire library" row); it overlays the browse listing.
  const searchActive = searchQ !== "";
  const search = useSWR<SearchListing>(
    open && searchQ ? ["nas-search", searchQ] : null,
    (k: string[]) => apiGet<SearchListing>(`/api/nas/search?q=${encodeURIComponent(k[1]!)}`),
    { revalidateOnFocus: false },
  );
  const searchFolders = search.data?.folders ?? [];
  const searchTracks = search.data?.tracks ?? [];

  // Client-side filter of the current listing. Tracks keep their ORIGINAL index:
  // selection + playback are index-based and the server re-selects by position.
  const q = query.trim().toLowerCase();
  const filteredFolders = q ? folders.filter((f) => f.title.toLowerCase().includes(q)) : folders;
  const shownTracks = tracks
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        !q ||
        (t.title ?? "").toLowerCase().includes(q) ||
        (t.artist ?? "").toLowerCase().includes(q),
    );
  const visibleIndices = shownTracks.map(({ i }) => i);
  const allSelected = shownTracks.length > 0 && shownTracks.every(({ i }) => selected.has(i));

  function openFolder(f: Folder) {
    setSelected(new Set());
    setQuery("");
    setSearchQ("");
    setStack((s) => [...s, { id: f.id, title: f.title, art: f.art }]);
  }
  function goTo(index: number) {
    setSelected(new Set());
    setQuery("");
    setSearchQ("");
    setStack((s) => s.slice(0, index + 1));
  }
  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIndices.forEach((i) => next.delete(i));
      else visibleIndices.forEach((i) => next.add(i));
      return next;
    });
  }

  async function play(indices: number[] | null, label: string) {
    setBusy(true);
    try {
      // The server plays via UPnP and derives track title/artist/art from the
      // browse; we just pass the folder name to show as the album.
      const meta = { album: current.title };
      const body =
        indices && indices.length
          ? { object: current.id, indices, meta }
          : { object: current.id, meta };
      await apiSend(`/api/devices/${deviceId}/nas/play`, "POST", body);
      toast(label, "success");
      onPlayed();
      onOpenChange(false);
    } catch (e) {
      toast((e as ApiError).message || "Could not play", "error");
    } finally {
      setBusy(false);
    }
  }
  const playAll = () =>
    q
      ? play(visibleIndices, `Playing ${visibleIndices.length} track${visibleIndices.length === 1 ? "" : "s"}`)
      : play(null, `Playing ${current.title}`);
  const playSelected = () => {
    const idx = [...selected].sort((a, b) => a - b);
    play(idx, `Playing ${idx.length} track${idx.length === 1 ? "" : "s"}`);
  };
  const playOne = (i: number) => play([i], `Playing ${tracks[i]?.title ?? "track"}`);

  function runSearch() {
    const term = query.trim();
    if (term.length >= 2) setSearchQ(term);
  }
  function backToBrowsing() {
    setSearchQ("");
    setQuery("");
  }
  async function playSearchTrack(t: SearchTrack) {
    if (!t.parentId || !t.id) return;
    setBusy(true);
    try {
      await apiSend(`/api/devices/${deviceId}/nas/play`, "POST", {
        object: t.parentId,
        trackId: t.id,
        meta: { album: t.album ?? "" },
      });
      toast(`Playing ${t.title ?? "track"}`, "success");
      onPlayed();
      onOpenChange(false);
    } catch (e) {
      toast((e as ApiError).message || "Could not play", "error");
    } finally {
      setBusy(false);
    }
  }

  const startDrag = (e: React.PointerEvent) => dragControls.start(e);
  const empty = !isLoading && !error && folders.length === 0 && tracks.length === 0;
  const noMatches =
    !isLoading && !error && !empty && filteredFolders.length === 0 && shownTracks.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            {/* Full-viewport centering + drag-bounds layer. Centering lives HERE
                (flexbox), never on the panel: framer-motion writes an inline
                `transform` for the entrance/drag that would overwrite a
                translate-based centering and fling the panel off-screen. */}
            <div
              ref={constraintsRef}
              className="pointer-events-none fixed inset-0 z-[95] flex items-center justify-center p-4"
            >
              <Dialog.Content asChild>
                <motion.div
                  drag
                  dragControls={dragControls}
                  dragListener={false}
                  dragMomentum={false}
                  dragElastic={0.08}
                  dragConstraints={constraintsRef}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className="glass pointer-events-auto flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl p-6"
                >
                  {/* Drag handle: grip bar + title block. The close button opts out. */}
                  <div
                    onPointerDown={startDrag}
                    className="cursor-grab touch-none select-none active:cursor-grabbing"
                    title="Drag to move"
                  >
                    <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15" aria-hidden />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      onPointerDown={startDrag}
                      className="min-w-0 flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
                    >
                      <Dialog.Title className="text-lg font-semibold text-foreground">Library</Dialog.Title>
                      <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                        Open a folder, tap a track to play it, or select several.
                      </Dialog.Description>
                    </div>
                    <Dialog.Close
                      onPointerDown={(e) => e.stopPropagation()}
                      className="focus-ring rounded-xl p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                      aria-label="Close"
                    >
                      <X className="size-5" />
                    </Dialog.Close>
                  </div>

                  {/* Breadcrumb trail */}
                  <nav className="mt-3 flex items-center gap-0.5 overflow-x-auto pb-1 text-sm">
                    {stack.map((c, i) => {
                      const last = i === stack.length - 1;
                      return (
                        <div key={`${c.id}-${i}`} className="flex shrink-0 items-center gap-0.5">
                          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />}
                          <button
                            type="button"
                            onClick={() => goTo(i)}
                            disabled={last || busy}
                            className={cn(
                              "focus-ring flex max-w-[12rem] items-center gap-1 truncate rounded-lg px-2 py-1 transition",
                              last
                                ? "font-medium text-foreground"
                                : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                            )}
                          >
                            {i === 0 ? <Home className="size-4 shrink-0" /> : <span className="truncate">{c.title}</span>}
                          </button>
                        </div>
                      );
                    })}
                  </nav>

                  {/* Filter the current folder (live) or search the whole library (Enter) */}
                  {!isLoading && !error && (folders.length > 0 || tracks.length > 0 || searchActive) && (
                    <div className="relative mt-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") runSearch();
                        }}
                        placeholder="Filter this folder — press Enter to search the whole library…"
                        aria-label="Filter this folder, or press Enter to search the whole library"
                        className="focus-ring h-10 w-full rounded-xl border border-border bg-input pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60"
                      />
                      {(query || searchActive) && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setSearchQ("");
                          }}
                          aria-label="Clear"
                          className="focus-ring absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Offer a whole-library search for what's typed */}
                  {!searchActive && query.trim().length >= 2 && (
                    <button
                      type="button"
                      onClick={runSearch}
                      className="focus-ring mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-white/5"
                    >
                      <Search className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 truncate">
                        Search entire library for{" "}
                        <span className="font-medium text-foreground">“{query.trim()}”</span>
                      </span>
                    </button>
                  )}

                  {/* Search-mode header */}
                  {searchActive && (
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-muted-foreground">Results for “{searchQ}”</span>
                      <button
                        type="button"
                        onClick={backToBrowsing}
                        className="focus-ring shrink-0 rounded-lg px-2 py-1 font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        Back to browsing
                      </button>
                    </div>
                  )}

                  {/* Select-all toolbar (browse mode only, when the folder has tracks) */}
                  {!searchActive && shownTracks.length > 0 && (
                    <div className="mt-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={toggleAll}
                        disabled={busy}
                        className="focus-ring flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        <span
                          className={cn(
                            "grid size-4 place-items-center rounded border transition",
                            allSelected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {allSelected && <Check className="size-3" />}
                        </span>
                        {allSelected ? "Deselect all" : "Select all"}
                      </button>
                      {selected.size > 0 && (
                        <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                      )}
                    </div>
                  )}

                  {/* Listing */}
                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                    {searchActive ? (
                      search.isLoading ? (
                        <div className="flex min-h-[12rem] items-center justify-center">
                          <Spinner className="size-7 text-primary" />
                        </div>
                      ) : search.error ? (
                        <p className="py-12 text-center text-sm text-destructive">
                          {(search.error as ApiError).message || "Search failed."}
                        </p>
                      ) : searchFolders.length === 0 && searchTracks.length === 0 ? (
                        <p className="py-12 text-center text-sm text-muted-foreground">
                          No results for “{searchQ}”.
                        </p>
                      ) : (
                        <div className="space-y-0.5">
                          {searchFolders.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => openFolder(f)}
                              disabled={busy}
                              className="focus-ring group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/5 disabled:opacity-60"
                            >
                              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-white/[0.03]">
                                {f.art ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={f.art}
                                    alt=""
                                    draggable={false}
                                    loading="lazy"
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <Folder className="size-5 text-muted-foreground/60" />
                                )}
                              </div>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                {f.title}
                              </span>
                              <ChevronRight className="size-5 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
                            </button>
                          ))}

                          {searchFolders.length > 0 && searchTracks.length > 0 && (
                            <div className="my-1 border-t border-border/50" />
                          )}

                          <ul className="space-y-0.5">
                            {searchTracks.map((t, idx) => {
                              const playable = !!t.parentId && !!t.id;
                              return (
                                <li
                                  key={t.id ?? idx}
                                  className="flex items-center gap-1 rounded-2xl transition"
                                >
                                  <button
                                    type="button"
                                    onClick={() => playSearchTrack(t)}
                                    disabled={busy || !playable}
                                    title={playable ? `Play ${t.title ?? "track"}` : "Can't play this result"}
                                    className="focus-ring group flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/5 disabled:opacity-60"
                                  >
                                    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-white/[0.03]">
                                      {t.art ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={t.art}
                                          alt=""
                                          draggable={false}
                                          loading="lazy"
                                          className="size-full object-cover"
                                        />
                                      ) : (
                                        <div className="grid size-full place-items-center text-muted-foreground/40">
                                          <Music className="size-5" />
                                        </div>
                                      )}
                                      {playable && (
                                        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                                          <Play className="size-5 text-white" />
                                        </span>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-foreground">
                                        {t.title ?? "Untitled"}
                                      </p>
                                      {(t.artist || t.album) && (
                                        <p className="truncate text-xs text-muted-foreground">
                                          {[t.artist, t.album].filter(Boolean).join(" · ")}
                                        </p>
                                      )}
                                    </div>
                                    {t.duration != null && (
                                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                                        {fmtDur(t.duration)}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )
                    ) : isLoading ? (
                      <div className="flex min-h-[12rem] items-center justify-center">
                        <Spinner className="size-7 text-primary" />
                      </div>
                    ) : error ? (
                      <p className="py-12 text-center text-sm text-destructive">
                        {(error as ApiError).message || "Could not reach the media server."}
                      </p>
                    ) : empty ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">This folder is empty.</p>
                    ) : noMatches ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">
                        No matches for “{query.trim()}”.
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredFolders.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => openFolder(f)}
                            disabled={busy}
                            className="focus-ring group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/5 disabled:opacity-60"
                          >
                            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-white/[0.03]">
                              {f.art ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={f.art}
                                  alt=""
                                  draggable={false}
                                  loading="lazy"
                                  className="size-full object-cover"
                                />
                              ) : (
                                <Folder className="size-5 text-muted-foreground/60" />
                              )}
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {f.title}
                            </span>
                            <ChevronRight className="size-5 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
                          </button>
                        ))}

                        {filteredFolders.length > 0 && shownTracks.length > 0 && (
                          <div className="my-1 border-t border-border/50" />
                        )}

                        <ul className="space-y-0.5">
                          {shownTracks.map(({ t, i }) => {
                            const sel = selected.has(i);
                            return (
                              <li
                                key={t.id ?? i}
                                className={cn(
                                  "flex items-center gap-1 rounded-2xl transition",
                                  sel && "bg-primary/10",
                                )}
                              >
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={sel}
                                  aria-label={`Select ${t.title ?? "track"}`}
                                  onClick={() => toggle(i)}
                                  disabled={busy}
                                  className="focus-ring grid size-9 shrink-0 place-items-center rounded-xl"
                                >
                                  <span
                                    className={cn(
                                      "grid size-5 place-items-center rounded-md border transition",
                                      sel
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-white/[0.03]",
                                    )}
                                  >
                                    {sel && <Check className="size-3.5" />}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => playOne(i)}
                                  disabled={busy}
                                  title={`Play ${t.title ?? "track"}`}
                                  className="focus-ring group flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/5 disabled:opacity-60"
                                >
                                  <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-white/[0.03]">
                                    {t.art ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={t.art}
                                        alt=""
                                        draggable={false}
                                        loading="lazy"
                                        className="size-full object-cover"
                                      />
                                    ) : (
                                      <div className="grid size-full place-items-center text-muted-foreground/40">
                                        <Music className="size-5" />
                                      </div>
                                    )}
                                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                                      <Play className="size-5 text-white" />
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                      {t.title ?? "Untitled"}
                                    </p>
                                    {t.artist && (
                                      <p className="truncate text-xs text-muted-foreground">{t.artist}</p>
                                    )}
                                  </div>
                                  {t.duration != null && (
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                                      {fmtDur(t.duration)}
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Play actions (browse mode only) */}
                  {!searchActive && shownTracks.length > 0 && (
                    <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
                      {selected.size > 0 ? (
                        <>
                          <Button onClick={playSelected} disabled={busy} className="flex-1">
                            {busy ? <Spinner className="size-5" /> : <Play className="size-5" />}
                            Play {selected.size} selected
                          </Button>
                          <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={busy}>
                            Clear
                          </Button>
                        </>
                      ) : (
                        <Button variant="secondary" onClick={playAll} disabled={busy} className="flex-1">
                          {busy ? <Spinner className="size-5" /> : <ListMusic className="size-5" />}
                          Play all {shownTracks.length} track{shownTracks.length === 1 ? "" : "s"}
                        </Button>
                      )}
                    </div>
                  )}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
