"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  clientIsOnLaterCivilDate,
  nextLocalMidnightMs,
  quoteCivilDate,
} from "@/features/appearance/daily-quote";

/**
 * One-shot timer until the organization's next local midnight, then refresh.
 * Does not poll. After refresh the component remounts and reschedules.
 * If the client already crossed midnight during hydration, refresh once.
 */
export function DailyQuoteRefresh({
  timeZone,
  serverCivilDate,
}: {
  timeZone: string;
  serverCivilDate: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (clientIsOnLaterCivilDate(serverCivilDate, timeZone)) {
      const clientCivil = quoteCivilDate(timeZone);
      const key = `tesseli-daily-quote:${serverCivilDate}`;
      if (sessionStorage.getItem(key) === clientCivil) {
        return;
      }
      sessionStorage.setItem(key, clientCivil);
      router.refresh();
      return;
    }
    const remaining = nextLocalMidnightMs(timeZone) - Date.now();
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      router.refresh();
    }, remaining + 50);
    return () => window.clearTimeout(timer);
  }, [router, timeZone, serverCivilDate]);

  return null;
}
