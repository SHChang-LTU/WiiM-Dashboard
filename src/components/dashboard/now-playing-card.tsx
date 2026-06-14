"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Repeat,
  Repeat1,
  Shuffle,
  Music4,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { StepperSlider } from "@/components/ui/stepper-slider";
import { useToast } from "@/components/toast";
import { apiSend, ApiError } from "@/lib/client/api";
import { formatTime, cn } from "@/lib/utils";
import { SOURCES } from "@/lib/wiim/constants";
import { DynIcon } from "@/components/ui/icon";
import type { PlayerStatus } from "@/lib/wiim/types";

export function NowPlayingCard({
  deviceId,
  player,
  sourceLabels,
  onChanged,
}: {
  deviceId: string;
  player: PlayerStatus;
  sourceLabels?: Record<string, string>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(player.position);
  const [vol, setVol] = useState(player.volume);
  const [draggingVol, setDraggingVol] = useState(false);
  const [draggingSeek, setDraggingSeek] = useState(false);
  // Local repeat/shuffle so the buttons update instantly (optimistic); the
  // device reading is asymmetric and lags the poll otherwise.
  const [repeat, setRepeat] = useState(player.repeat);
  const [shuffle, setShuffle] = useState(player.shuffle);
  const loopFreezeUntil = useRef(0);

  const isPlaying = player.state === "playing";
  const srcDef = player.sourceKey ? SOURCES.find((s) => s.key === player.sourceKey) : undefined;
  const sourceDisplay =
    (player.sourceKey && sourceLabels?.[player.sourceKey]?.trim()) || player.sourceLabel;
  // Physical inputs (Optical, Line-in, Coax, HDMI, Phono…) don't carry cover
  // art — show the source icon instead of a stale/blank image. Only
  // network/streaming sources display album art.
  const isPhysicalInput = !!player.sourceKey && player.sourceKey !== "wifi";
  const showArt = !!player.albumArt && !isPhysicalInput;

  // Reset interpolated position on track / status change.
  useEffect(() => {
    if (!draggingSeek) setPos(player.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.position, player.title, player.state]);

  // Sync volume from device unless the user is dragging it.
  useEffect(() => {
    if (!draggingVol) setVol(player.volume);
  }, [player.volume, draggingVol]);

  // Sync repeat/shuffle from device, but briefly freeze right after a tap so the
  // optimistic value isn't overwritten by a poll that fires before the device
  // reflects the change.
  useEffect(() => {
    if (Date.now() >= loopFreezeUntil.current) {
      setRepeat(player.repeat);
      setShuffle(player.shuffle);
    }
  }, [player.repeat, player.shuffle]);

  // Tick position forward while playing.
  useEffect(() => {
    if (!isPlaying || draggingSeek) return;
    const t = setInterval(
      () => setPos((p) => (player.duration ? Math.min(player.duration, p + 1) : p + 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [isPlaying, draggingSeek, player.duration]);

  async function send(body: Record<string, unknown>, optimistic?: () => void) {
    optimistic?.();
    setBusy(true);
    try {
      await apiSend(`/api/devices/${deviceId}/control`, "POST", body);
      onChanged();
    } catch (e) {
      toast((e as ApiError).message || "Command failed", "error");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const hasDuration = player.duration > 0;
  const VolIcon = player.muted || vol === 0 ? VolumeX : vol < 50 ? Volume1 : Volume2;

  function cycleRepeat() {
    const next = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    setRepeat(next);
    loopFreezeUntil.current = Date.now() + 2500;
    void send({ action: "repeat", repeat: next, shuffle });
  }

  function toggleShuffle() {
    const next = !shuffle;
    setShuffle(next);
    loopFreezeUntil.current = Date.now() + 2500;
    void send({ action: "shuffle", repeat, shuffle: next });
  }

  return (
    <Card className="overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        {/* Artwork — fixed square; self-start stops the flex row stretching it */}
        <div className="relative mx-auto size-44 shrink-0 self-center overflow-hidden rounded-2xl bg-white/5 shadow-xl sm:mx-0 sm:size-52 sm:self-start">
          <AnimatePresence mode="wait">
            {showArt ? (
              <motion.div
                key={player.albumArt ?? "art"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={player.albumArt ?? undefined}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                />
              </motion.div>
            ) : (
              // No cover art (physical input / radio) → show the source itself.
              <div className="grid size-full place-items-center bg-gradient-to-br from-white/[0.07] to-transparent">
                <div className="flex flex-col items-center gap-2 px-3 text-center text-muted-foreground/55">
                  {srcDef ? (
                    <DynIcon name={srcDef.icon} className="size-14" />
                  ) : (
                    <Music4 className="size-14" />
                  )}
                  <span className="text-[11px] font-medium uppercase tracking-wide">
                    {sourceDisplay}
                  </span>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Meta + transport */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {srcDef ? (
                <DynIcon name={srcDef.icon} className="size-3.5" />
              ) : (
                <Music4 className="size-3.5" />
              )}
              {sourceDisplay}
            </span>
            {player.quality && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                {player.quality}
              </span>
            )}
          </div>
          <h2 className="truncate text-xl font-semibold text-foreground">
            {player.title ?? (player.state === "stopped" ? "Nothing playing" : "—")}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{player.artist ?? ""}</p>
          {player.album && (
            <p className="truncate text-xs text-muted-foreground/70">{player.album}</p>
          )}

          {/* Progress — only for real tracks. Physical inputs (optical/line-in)
              have no seekable timeline, so the slider is hidden there. */}
          {!isPhysicalInput && (
            <div className="mt-4">
              <Slider
                value={Math.min(pos, player.duration || pos)}
                min={0}
                max={hasDuration ? player.duration : Math.max(pos, 1)}
                onChange={(v) => {
                  setDraggingSeek(true);
                  setPos(v);
                }}
                onCommit={(v) => {
                  setDraggingSeek(false);
                  if (hasDuration) void send({ action: "seek", value: v });
                }}
                disabled={!hasDuration}
                aria-label="Seek"
              />
              <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{formatTime(pos)}</span>
                <span>{hasDuration ? formatTime(player.duration) : "—"}</span>
              </div>
            </div>
          )}

          {/* Transport buttons */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={toggleShuffle}
              className={cn(
                "focus-ring grid size-10 place-items-center rounded-full transition",
                shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Shuffle"
            >
              <Shuffle className="size-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void send({ action: "prev" })}
                disabled={busy}
                className="focus-ring grid size-12 place-items-center rounded-full text-foreground transition hover:bg-white/8"
                aria-label="Previous"
              >
                <SkipBack className="size-6 fill-current" />
              </button>
              <button
                onClick={() =>
                  void send({ action: "toggle" })
                }
                disabled={busy}
                className="focus-ring grid size-16 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/30 transition active:scale-95"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="size-7 fill-current" />
                ) : (
                  <Play className="size-7 translate-x-0.5 fill-current" />
                )}
              </button>
              <button
                onClick={() => void send({ action: "next" })}
                disabled={busy}
                className="focus-ring grid size-12 place-items-center rounded-full text-foreground transition hover:bg-white/8"
                aria-label="Next"
              >
                <SkipForward className="size-6 fill-current" />
              </button>
            </div>

            <button
              onClick={cycleRepeat}
              className={cn(
                "focus-ring grid size-10 place-items-center rounded-full transition",
                repeat !== "off" ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off"}
            >
              {repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
            </button>
          </div>

          {/* Volume */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => void send({ action: player.muted ? "unmute" : "mute" })}
              className="focus-ring grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
              aria-label={player.muted ? "Unmute" : "Mute"}
            >
              <VolIcon className="size-5" />
            </button>
            <StepperSlider
              value={vol}
              min={0}
              max={100}
              bigStep={1}
              onChange={(v) => {
                setDraggingVol(true);
                setVol(v);
              }}
              onCommit={(v) => {
                setDraggingVol(false);
                void send({ action: "volume", value: v });
              }}
              ariaLabel="Volume"
              className="flex-1"
            />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {player.muted ? "—" : vol}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
