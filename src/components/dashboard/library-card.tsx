"use client";

import { useState } from "react";
import { Library } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrowseDialog } from "./browse-dialog";

/** Entry point for browsing the NAS music library and playing an album. */
export function LibraryCard({
  deviceId,
  onChanged,
}: {
  deviceId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="flex items-center justify-between gap-3 p-5">
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground">
          <Library className="size-4" />
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Library
        </h3>
      </div>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Library className="size-5" /> Browse albums
      </Button>
      <BrowseDialog deviceId={deviceId} open={open} onOpenChange={setOpen} onPlayed={onChanged} />
    </Card>
  );
}
