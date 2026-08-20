"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LockScreen } from "@/features/shell/lock/lock-screen";
import { DEFAULT_INACTIVITY_TIMEOUT_MINUTES } from "@/features/shell/lock/constants";
import { useIdleTimer } from "@/features/shell/lock/use-idle-timer";

interface LockContextValue {
  locked: boolean;
  lockNow: () => void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function useLock() {
  const context = useContext(LockContext);
  if (!context) {
    throw new Error("useLock must be used within LockProvider");
  }
  return context;
}

export interface LockProviderProps {
  children: ReactNode;
  userEmail: string;
  /** From `practice_settings.inactivity_timeout_minutes` when available. */
  timeoutMinutes?: number;
}

export function LockProvider({
  children,
  userEmail,
  timeoutMinutes,
}: LockProviderProps) {
  const effectiveTimeout = timeoutMinutes ?? DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
  const [locked, setLocked] = useState(false);

  const lockNow = useCallback(() => setLocked(true), []);
  const unlock = useCallback(() => setLocked(false), []);

  useIdleTimer(effectiveTimeout * 60 * 1000, lockNow, !locked);

  const value = useMemo(() => ({ locked, lockNow }), [locked, lockNow]);

  return (
    <LockContext.Provider value={value}>
      {children}
      {locked ? <LockScreen userEmail={userEmail} onUnlock={unlock} /> : null}
    </LockContext.Provider>
  );
}
