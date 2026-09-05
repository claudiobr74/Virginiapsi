"use client";

import { useEffect, useState } from "react";

const IDLE_WAIT_MS = 60_000;
const MIN_WAIT_MS = 250;

function nextTickMs(endsAtList: string[], nowMs: number): number {
  const upcoming = endsAtList
    .map((iso) => new Date(iso).getTime())
    .filter((time) => Number.isFinite(time) && time > nowMs)
    .sort((left, right) => left - right);
  if (upcoming.length === 0) {
    return IDLE_WAIT_MS;
  }
  return Math.max(upcoming[0] - nowMs + MIN_WAIT_MS, MIN_WAIT_MS);
}

/**
 * Re-renders when the nearest `ends_at` elapses so cards go green → blue
 * without a full page reload. Idles 60s when nothing is ending soon.
 */
export function useAgendaClock(endsAtList: string[]): Date {
  const [now, setNow] = useState(() => new Date());
  const endsKey = endsAtList.join("|");

  useEffect(() => {
    const delay = nextTickMs(endsKey ? endsKey.split("|") : [], now.getTime());
    const timer = window.setTimeout(() => {
      setNow(new Date());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [now, endsKey]);

  return now;
}
