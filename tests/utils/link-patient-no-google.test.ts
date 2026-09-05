import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("linkPatientAndStartSessionAction — sem escrita Google", () => {
  it("não importa cliente Google nem PATCH/POST de evento", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/features/calendar/link-patient-actions.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/getCalendarClientForOrganization/);
    expect(source).not.toMatch(/insertEvent/);
    expect(source).not.toMatch(/patchEvent/);
    expect(source).not.toMatch(/google-write/);
    expect(source).not.toMatch(/googleapis/);
    expect(source).toContain("link_external_appointment_patient");
  });
});
