import { describe, expect, it } from "vitest";
import {
  shouldUpsertExternalGoogleEvent,
  managedEventCancelIsConflict,
} from "@/lib/integrations/google/pull-filter";

describe("shouldUpsertExternalGoogleEvent", () => {
  it("não importa evento já gerenciado pelo VirgíniaPsi", () => {
    expect(
      shouldUpsertExternalGoogleEvent(
        "evt-tesseli",
        false,
        new Set(["evt-tesseli"]),
        new Set(),
      ),
    ).toBe(false);
  });

  it("não cria linha fantasma para cancelamento nunca importado", () => {
    expect(
      shouldUpsertExternalGoogleEvent("evt-novo", true, new Set(), new Set()),
    ).toBe(false);
  });

  it("atualiza evento externo já conhecido, inclusive cancelado", () => {
    expect(
      shouldUpsertExternalGoogleEvent(
        "evt-ext",
        true,
        new Set(),
        new Set(["evt-ext"]),
      ),
    ).toBe(true);
  });

  it("importa evento Google novo com origem GOOGLE_EXTERNAL", () => {
    expect(
      shouldUpsertExternalGoogleEvent("evt-novo", false, new Set(["outro"]), new Set()),
    ).toBe(true);
  });
});

describe("managedEventCancelIsConflict", () => {
  it("marca conflito quando o Google cancela um evento clínico ainda ativo", () => {
    expect(managedEventCancelIsConflict(true, "scheduled")).toBe(true);
    expect(managedEventCancelIsConflict(true, "cancelled")).toBe(false);
    expect(managedEventCancelIsConflict(false, "scheduled")).toBe(false);
  });
});
