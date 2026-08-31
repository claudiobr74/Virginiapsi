import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tesseliAppointmentNeedsGooglePush } from "@/features/calendar/sync-policy";

const ROOT = path.resolve(__dirname, "../..");

describe("tesseliAppointmentNeedsGooglePush", () => {
  it("reenvia create/remarcação pendente e erro", () => {
    expect(
      tesseliAppointmentNeedsGooglePush({
        sync_status: "not_synced",
        status: "scheduled",
        google_event_id: null,
      }),
    ).toBe(true);
    expect(
      tesseliAppointmentNeedsGooglePush({
        sync_status: "error",
        status: "scheduled",
        google_event_id: "evt-1",
      }),
    ).toBe(true);
  });

  it("não reenvia consulta já sincronizada", () => {
    expect(
      tesseliAppointmentNeedsGooglePush({
        sync_status: "synced",
        status: "scheduled",
        google_event_id: "evt-1",
      }),
    ).toBe(false);
  });

  it("cancelamento local com google_event_id só reenvia se não ficou marcado synced", () => {
    expect(
      tesseliAppointmentNeedsGooglePush({
        sync_status: "not_synced",
        status: "cancelled",
        google_event_id: "evt-1",
      }),
    ).toBe(true);
    expect(
      tesseliAppointmentNeedsGooglePush({
        sync_status: "synced",
        status: "cancelled",
        google_event_id: "evt-1",
      }),
    ).toBe(false);
  });
});

describe("cancelamento local marca not_synced antes do push", () => {
  it("updateAppointmentStatusAction zera sync_status no cancelamento TESSELI", () => {
    const source = readFileSync(
      path.join(ROOT, "src/features/calendar/appointment-actions.ts"),
      "utf8",
    );
    expect(source).toContain('fields.sync_status = "not_synced"');
    expect(source).toContain('.eq("origin", "TESSELI")');
    expect(source).toContain("pushAppointmentToGoogle");
  });
});
