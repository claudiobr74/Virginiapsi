"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  clientIsOnLaterCivilDate,
  nextLocalMidnightMs,
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
      router.refresh();
      return;
    }
    const delay = Math.max(50, nextLocalMidnightMs(timeZone) - Date.now() + 50);
    const timer = window.setTimeout(() => {
      router.refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [router, timeZone, serverCivilDate]);

  return null;
}
