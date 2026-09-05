import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_SYNC_USER_ERROR,
  LOCAL_MIRROR_DELETE_ERROR,
  LOCAL_MIRROR_UPDATE_ERROR,
  PARTIAL_SYNC_FAILURE,
  persistGoogleCreateLink,
  resultAfterGoogleDeleteAndLocal,
  resultAfterGooglePatchAndLocal,
} from "@/features/calendar/google-sync-compensation";

describe("persistGoogleCreateLink", () => {
  it("Google insert OK + DB update FAIL → compensating delete executado", async () => {
    const compensateDelete = vi.fn(async () => ({ ok: true }));
    const markLocalError = vi.fn(async () => ({ error: null }));

    const result = await persistGoogleCreateLink({
      appointmentId: "appt-1",
      googleEventId: "evt-1",
      persist: async () => ({ error: { message: "db down" } }),
      compensateDelete,
      markLocalError,
    });

    expect(compensateDelete).toHaveBeenCalledTimes(1);
    expect(markLocalError).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      syncError: GOOGLE_SYNC_USER_ERROR,
      compensated: true,
    });
  });

  it("Google insert OK + DB update FAIL + compensating delete FAIL → PARTIAL_SYNC_FAILURE", async () => {
    const compensateDelete = vi.fn(async () => ({ ok: false }));
    const markLocalError = vi.fn(async () => ({ error: null }));

    const result = await persistGoogleCreateLink({
      appointmentId: "appt-2",
      googleEventId: "evt-2",
      persist: async () => ({ error: { message: "db down" } }),
      compensateDelete,
      markLocalError,
    });

    expect(compensateDelete).toHaveBeenCalledTimes(1);
    expect(markLocalError).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok || result.compensated) {
      throw new Error("expected uncompensated partial failure");
    }
    expect(result.syncError).toBe(
      `${PARTIAL_SYNC_FAILURE} appointment_id=appt-2 google_event_id=evt-2`,
    );
    expect(result.partialFailure).toEqual({
      appointmentId: "appt-2",
      googleEventId: "evt-2",
    });
  });

  it("persistência local OK não dispara compensação", async () => {
    const compensateDelete = vi.fn(async () => ({ ok: true }));
    const result = await persistGoogleCreateLink({
      appointmentId: "appt-3",
      googleEventId: "evt-3",
      persist: async () => ({ error: null }),
      compensateDelete,
      markLocalError: async () => ({ error: null }),
    });
    expect(result).toEqual({ ok: true });
    expect(compensateDelete).not.toHaveBeenCalled();
  });
});

describe("resultAfterGooglePatchAndLocal", () => {
  it("Google patch OK + mirror RPC FAIL → não retorna sucesso silencioso", () => {
    expect(resultAfterGooglePatchAndLocal({ message: "rpc failed" })).toEqual({
      error: LOCAL_MIRROR_UPDATE_ERROR,
    });
    expect(resultAfterGooglePatchAndLocal(null)).toEqual({});
  });
});

describe("resultAfterGoogleDeleteAndLocal", () => {
  it("Google delete 204 + mirror delete FAIL → não retorna sucesso total", () => {
    expect(resultAfterGoogleDeleteAndLocal({ message: "rpc failed" })).toEqual({
      error: LOCAL_MIRROR_DELETE_ERROR,
    });
  });

  it("Google delete 404 → mirror removido quando RPC local não falha", () => {
    expect(resultAfterGoogleDeleteAndLocal(null)).toEqual({});
  });
});
