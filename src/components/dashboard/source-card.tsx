"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { OptionGrid } from "./option-grid";
import { useToast } from "@/components/toast";
import { apiSend, ApiError } from "@/lib/client/api";
import { SOURCES } from "@/lib/wiim/constants";

export function SourceCard({
  deviceId,
  sourceKeys,
  currentKey,
  sourceLabels,
  autoSourceLabels,
  onChanged,
}: {
  deviceId: string;
  sourceKeys: string[];
  currentKey: string | null;
  sourceLabels?: Record<string, string>;
  autoSourceLabels?: Record<string, string>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const options = SOURCES.filter((s) => sourceKeys.includes(s.key)).map((s) => ({
    id: s.value,
    label: sourceLabels?.[s.key]?.trim() || autoSourceLabels?.[s.key]?.trim() || s.label,
    icon: s.icon,
  }));

  const currentValue = SOURCES.find((s) => s.key === currentKey)?.value ?? null;

  async function select(value: string) {
    setBusyId(value);
    try {
      await apiSend(`/api/devices/${deviceId}/source`, "POST", { value });
      onChanged();
    } catch (e) {
      toast((e as ApiError).message || "Could not switch source", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (options.length === 0) return null;

  return (
    <Card className="pb-5">
      <CardHeader icon={<Radio className="size-4" />} title="Source" />
      <div className="px-5 pt-4">
        <OptionGrid options={options} currentId={currentValue} busyId={busyId} onSelect={select} />
      </div>
    </Card>
  );
}
