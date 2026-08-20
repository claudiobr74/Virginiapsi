/**
 * Default inactivity timeout, in minutes, before the workspace auto-locks.
 * `practice_settings.inactivity_timeout_minutes` (Phase 2+) will override
 * this default per organization once tenancy settings exist.
 */
export const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 15;

export const INACTIVITY_STORAGE_KEY = "tesseli-inactivity-timeout-minutes";
