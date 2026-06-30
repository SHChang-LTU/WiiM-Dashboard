"use client";

import { useState } from "react";
import useSWR from "swr";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { Disc3, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/toast";
import { apiGet, apiSend, ApiError } from "@/lib/client/api";

type Album = { id: string; title: string; artist: string | null; art: string | null };

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
  const [busy, setBusy] = useState<string | null>(null);

  // Only fetch while the dialog is open; albums rarely change so don't refocus-revalidate.
  const { data, error, isLoading } = useSWR<{ albums: Album[] }>(
    open ? "/api/nas/browse" : null,
    (url: string) => apiGet<{ albums: Album[] }>(url),
    { revalidateOnFocus: false },
  );
  const albums = data?.albums ?? [];

  async function play(album: Album) {
    setBusy(album.id);
    try {
      await apiSend(`/api/devices/${deviceId}/nas/play`, "POST", { object: album.id });
      toast(`Playing ${album.title}`, "success");
      onPlayed();
      onOpenChange(false);
    } catch (e) {
      toast((e as ApiError).message || "Could not play album", "error");
    } finally {
      setBusy(null);
    }
  }

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
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="glass fixed left-1/2 top-1/2 z-[95] flex max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-foreground">Library</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                      Tap an album to play it on this device.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    className="focus-ring rounded-xl p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-5" />
                  </Dialog.Close>
                </div>

                <div className="mt-4 min-h-[12rem] overflow-y-auto [-webkit-overflow-scrolling:touch]">
                  {isLoading ? (
                    <div className="flex min-h-[12rem] items-center justify-center">
                      <Spinner className="size-7 text-primary" />
                    </div>
                  ) : error ? (
                    <p className="py-12 text-center text-sm text-destructive">
                      {(error as ApiError).message || "Could not reach the media server."}
                    </p>
                  ) : albums.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No albums found on the media server.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {albums.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => void play(a)}
                          disabled={busy !== null}
                          title={a.artist ? `${a.title} — ${a.artist}` : a.title}
                          className="focus-ring group flex flex-col gap-2 rounded-2xl p-2 text-left transition hover:bg-white/5 disabled:opacity-60"
                        >
                          <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-white/[0.03]">
                            {a.art ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.art}
                                alt=""
                                draggable={false}
                                loading="lazy"
                                className="absolute inset-0 size-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 grid place-items-center text-muted-foreground/40">
                                <Disc3 className="size-10" />
                              </div>
                            )}
                            {busy === a.id && (
                              <span className="absolute inset-0 grid place-items-center bg-black/45">
                                <Spinner className="size-6 text-white" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                            {a.artist && (
                              <p className="truncate text-xs text-muted-foreground">{a.artist}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
