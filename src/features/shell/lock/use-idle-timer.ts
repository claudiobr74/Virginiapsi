"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

export function useIdleTimer(timeoutMs: number, onIdle: () => void, enabled: boolean) {
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    function reset() {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), timeoutMs);
    }

    reset();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, reset, { passive: true });
    });

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, reset);
      });
    };
  }, [timeoutMs, enabled]);
}
