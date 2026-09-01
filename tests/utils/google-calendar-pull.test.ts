import { describe, expect, it, vi } from "vitest";
import {
  decideGooglePullEvent,
  googleEventIdsMissingFromSnapshot,
  runGoogleCalendarPull,
} from "@/features/calendar/google-calendar-pull";
import type { GoogleCalendarEvent } from "@/lib/integrations/google/calendar-client";

function event(overrides: Partial<GoogleCalendarEvent> & Pick<GoogleCalendarEvent, "id">): GoogleCalendarEvent {
  return {
    summary: "Evento",
    ...overrides,
  };
}

describe("decideGooglePullEvent", () => {
  it("trata Google status=cancelled como source deletion antes de exigir start/end", () => {
    expect(
      decideGooglePullEvent(
        event({
          id: "helio-x",
          status: "cancelled",
          summary: "Helio-1??? Julianna-1???",
        }),
      ),
    ).toEqual({ action: "mark_deleted", googleEventId: "helio-x" });
  });

  it("não faz upsert de tombstone sem janela", () => {
    const decision = decideGooglePullEvent(
      event({
        id: "tombstone-1",
        status: "cancelled",
      }),
    );
    expect(decision.action).toBe("mark_deleted");
  });

  it("não classifica colorId 8 como status cancelled no upsert", () => {
    const decision = decideGooglePullEvent(
      event({
        id: "lucas-1",
        status: "confirmed",
        summary: "Lucas B+1(viajando)",
        colorId: "8",
        eventType: "default",
        start: { dateTime: "2026-09-01T12:00:00.000Z" },
        end: { dateTime: "2026-09-01T13:00:00.000Z" },
      }),
    );
    expect(decision).toMatchObject({
      action: "upsert",
      status: "scheduled",
      googleColorId: "8",
    });
  });

  it("persiste (desmarcou) como cancelled clínico", () => {
    const decision = decideGooglePullEvent(
      event({
        id: "gio-1",
        status: "confirmed",
        summary: "Giovanna (desmarcou)",
        colorId: "8",
        start: { dateTime: "2026-09-01T12:00:00.000Z" },
        end: { dateTime: "2026-09-01T13:00:00.000Z" },
      }),
    );
    expect(decision).toMatchObject({ action: "upsert", status: "cancelled" });
  });
});

describe("runGoogleCalendarPull", () => {
  it("Hélio: tombstone sem start/end marca google deleted e não faz upsert", async () => {
    const markDeleted = vi.fn(async () => undefined);
    const upsertExternal = vi.fn(async () => undefined);
    const reconcileUnseen = vi.fn(async () => 0);

    const result = await runGoogleCalendarPull({
      listEvents: async () => ({
        items: [
          event({
            id: "X",
            status: "cancelled",
            summary: "Helio-1??? Julianna-1???",
          }),
        ],
      }),
      upsertExternal,
      markDeleted,
      reconcileUnseen,
    });

    expect(markDeleted).toHaveBeenCalledTimes(1);
    expect(markDeleted).toHaveBeenCalledWith("X");
    expect(upsertExternal).not.toHaveBeenCalled();
    expect(result.seenActiveGoogleEventIds).toEqual([]);
    expect(reconcileUnseen).toHaveBeenCalledTimes(1);
    expect(reconcileUnseen).toHaveBeenCalledWith([]);
  });

  it("snapshot completo: A,B,C no Google e A,B,C,D no mirror → D reconciliado", async () => {
    const reconcileUnseen = vi.fn(async (seen: string[]) => {
      const missing = googleEventIdsMissingFromSnapshot(
        ["A", "B", "C", "D"],
        new Set(seen),
      );
      expect(missing).toEqual(["D"]);
      return missing.length;
    });

    const result = await runGoogleCalendarPull({
      listEvents: async () => ({
        items: [
          event({
            id: "A",
            start: { dateTime: "2026-09-01T10:00:00.000Z" },
            end: { dateTime: "2026-09-01T11:00:00.000Z" },
          }),
          event({
            id: "B",
            start: { dateTime: "2026-09-01T11:00:00.000Z" },
            end: { dateTime: "2026-09-01T12:00:00.000Z" },
          }),
          event({
            id: "C",
            start: { dateTime: "2026-09-01T12:00:00.000Z" },
            end: { dateTime: "2026-09-01T13:00:00.000Z" },
          }),
        ],
      }),
      upsertExternal: async () => undefined,
      markDeleted: async () => undefined,
      reconcileUnseen,
    });

    expect(result.seenActiveGoogleEventIds.sort()).toEqual(["A", "B", "C"]);
    expect(result.reconciledUnseenCount).toBe(1);
    expect(reconcileUnseen).toHaveBeenCalledTimes(1);
  });

  it("não executa snapshot cleanup se a segunda página falhar", async () => {
    const reconcileUnseen = vi.fn(async () => 0);
    const upsertExternal = vi.fn(async () => undefined);
    let page = 0;

    await expect(
      runGoogleCalendarPull({
        listEvents: async () => {
          page += 1;
          if (page === 1) {
            return {
              items: [
                event({
                  id: "A",
                  start: { dateTime: "2026-09-01T10:00:00.000Z" },
                  end: { dateTime: "2026-09-01T11:00:00.000Z" },
                }),
              ],
              nextPageToken: "page-2",
            };
          }
          throw new Error("google page 2 failed");
        },
        upsertExternal,
        markDeleted: async () => undefined,
        reconcileUnseen,
      }),
    ).rejects.toThrow(/page 2 failed/);

    expect(upsertExternal).toHaveBeenCalledTimes(1);
    expect(reconcileUnseen).not.toHaveBeenCalled();
  });

  it("recorrência: tombstone da instância não apaga a irmã pelo prefixo da série", async () => {
    const markDeleted = vi.fn(async () => undefined);
    const upsertExternal = vi.fn(async () => undefined);
    const reconcileUnseen = vi.fn(async (seen: string[]) => {
      const missing = googleEventIdsMissingFromSnapshot(
        ["series_20260901T100000Z", "series_20260908T100000Z"],
        new Set(seen),
      );
      expect(missing).toEqual([]);
      return 0;
    });

    await runGoogleCalendarPull({
      listEvents: async () => ({
        items: [
          event({
            id: "series_20260901T100000Z",
            status: "cancelled",
          }),
          event({
            id: "series_20260908T100000Z",
            status: "confirmed",
            start: { dateTime: "2026-09-08T10:00:00.000Z" },
            end: { dateTime: "2026-09-08T11:00:00.000Z" },
          }),
        ],
      }),
      upsertExternal,
      markDeleted,
      reconcileUnseen,
    });

    expect(markDeleted).toHaveBeenCalledTimes(1);
    expect(markDeleted).toHaveBeenCalledWith("series_20260901T100000Z");
    expect(markDeleted).not.toHaveBeenCalledWith("series_20260908T100000Z");
    expect(upsertExternal).toHaveBeenCalledTimes(1);
    expect(upsertExternal.mock.calls[0]?.[0]).toMatchObject({
      googleEventId: "series_20260908T100000Z",
    });
  });
});
