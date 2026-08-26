"use client";

import { useEffect, useState } from "react";
import { elapsedSecondsBetween, formatElapsedHms } from "@/lib/utils/elapsed";
import { cn } from "@/lib/utils/cn";

export function SessionElapsedTimer({
  startedAt,
  endedAt,
  running,
  initialElapsedSeconds,
  className,
}: {
  startedAt: string | null;
  endedAt?: string | null;
  running: boolean;
  initialElapsedSeconds: number;
  className?: string;
}) {
  const [nowIso, setNowIso] = useState<string | null>(null);

  useEffect(() => {
    if (!startedAt || !running) {
      return;
    }
    const tick = () => setNowIso(new Date().toISOString());
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, running]);

  if (!startedAt) {
    return (
      <span className={cn("font-mono text-sm font-bold tabular-nums text-muted-foreground", className)}>
        —
      </span>
    );
  }

  const seconds = running
    ? nowIso
      ? elapsedSecondsBetween(startedAt, nowIso)
      : initialElapsedSeconds
    : elapsedSecondsBetween(startedAt, endedAt ?? startedAt);

  return (
    <span
      className={cn("font-mono text-sm font-bold tabular-nums text-foreground", className)}
      title="Tempo decorrido desde o início da sessão"
    >
      {formatElapsedHms(seconds)}
    </span>
  );
}
