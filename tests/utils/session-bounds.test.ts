import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { foldDirectorySessionBounds } from "@/features/patients/session-bounds";

const PATIENT = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-09-01T15:00:00.000Z");

describe("foldDirectorySessionBounds", () => {
  it("usa TESSELI e GOOGLE_EXTERNAL quando há patient_id", () => {
    const { lastByPatient, nextByPatient } = foldDirectorySessionBounds(
      [
        {
          patient_id: PATIENT,
          starts_at: "2026-08-20T12:00:00.000Z",
          status: "scheduled",
        },
        {
          patient_id: PATIENT,
          starts_at: "2026-09-10T12:00:00.000Z",
          status: "scheduled",
        },
      ],
      NOW,
    );
    expect(lastByPatient.get(PATIENT)).toBe("2026-08-20T12:00:00.000Z");
    expect(nextByPatient.get(PATIENT)).toBe("2026-09-10T12:00:00.000Z");
  });

  it("GOOGLE_EXTERNAL com patient_id explícito conta; origin não é consultada", () => {
    const { lastByPatient } = foldDirectorySessionBounds(
      [
        {
          patient_id: PATIENT,
          starts_at: "2026-08-20T12:00:00.000Z",
          status: "scheduled",
        },
      ],
      NOW,
    );
    expect(lastByPatient.get(PATIENT)).toBe("2026-08-20T12:00:00.000Z");
    expect(foldDirectorySessionBounds.toString()).not.toMatch(/origin/);
  });

  it("ignora GOOGLE_EXTERNAL sem patient_id", () => {
    const { lastByPatient, nextByPatient } = foldDirectorySessionBounds(
      [
        {
          patient_id: null,
          starts_at: "2026-08-01T12:00:00.000Z",
          status: "scheduled",
        },
        {
          patient_id: null,
          starts_at: "2026-09-20T12:00:00.000Z",
          status: "scheduled",
        },
      ],
      NOW,
    );
    expect(lastByPatient.size).toBe(0);
    expect(nextByPatient.size).toBe(0);
  });

  it("ignora cancelados", () => {
    const { lastByPatient, nextByPatient } = foldDirectorySessionBounds(
      [
        {
          patient_id: PATIENT,
          starts_at: "2026-08-20T12:00:00.000Z",
          status: "cancelled",
        },
        {
          patient_id: PATIENT,
          starts_at: "2026-09-10T12:00:00.000Z",
          status: "cancelled",
        },
      ],
      NOW,
    );
    expect(lastByPatient.has(PATIENT)).toBe(false);
    expect(nextByPatient.has(PATIENT)).toBe(false);
  });

  it("ignora soft-delete google_deleted_at", () => {
    const { lastByPatient } = foldDirectorySessionBounds(
      [
        {
          patient_id: PATIENT,
          starts_at: "2026-08-20T12:00:00.000Z",
          status: "scheduled",
          google_deleted_at: "2026-08-21T12:00:00.000Z",
        },
      ],
      NOW,
    );
    expect(lastByPatient.has(PATIENT)).toBe(false);
  });

  it("escolhe a última mais recente e a próxima mais próxima", () => {
    const { lastByPatient, nextByPatient } = foldDirectorySessionBounds(
      [
        {
          patient_id: PATIENT,
          starts_at: "2026-07-01T12:00:00.000Z",
          status: "scheduled",
        },
        {
          patient_id: PATIENT,
          starts_at: "2026-08-15T12:00:00.000Z",
          status: "scheduled",
        },
        {
          patient_id: PATIENT,
          starts_at: "2026-09-02T12:00:00.000Z",
          status: "scheduled",
        },
        {
          patient_id: PATIENT,
          starts_at: "2026-12-01T12:00:00.000Z",
          status: "scheduled",
        },
        {
          patient_id: OTHER,
          starts_at: "2026-08-01T12:00:00.000Z",
          status: "scheduled",
        },
      ],
      NOW,
    );
    expect(lastByPatient.get(PATIENT)).toBe("2026-08-15T12:00:00.000Z");
    expect(nextByPatient.get(PATIENT)).toBe("2026-09-02T12:00:00.000Z");
    expect(lastByPatient.get(OTHER)).toBe("2026-08-01T12:00:00.000Z");
  });
});

describe("listPatientDirectory query contract", () => {
  it("gera URL assinada e não restringe última/próxima a origin TESSELI", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/features/patients/queries.ts"),
      "utf8",
    );
    const start = source.indexOf("export async function listPatientDirectory");
    const end = source.indexOf("export async function getPatient(");
    const block = source.slice(start, end);
    expect(block).toContain("getPatientPortraitUrl");
    expect(block).toContain("google_deleted_at");
    expect(block).not.toContain('origin", "TESSELI"');
    expect(block).toContain("photoUrl");
    expect(source).toContain("list_patient_directory_appointments");
  });
});
