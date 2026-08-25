import { describe, expect, it } from "vitest";
import {
  canAccessPatientClinical,
  isClinicalPractitioner,
  isPsychologistAdmin,
  isSecretary,
} from "@/features/organizations/roles";

describe("papéis G2 / D4b", () => {
  it("administradora e psicóloga clínica são profissionais clínicas", () => {
    expect(isPsychologistAdmin("psychologist_admin")).toBe(true);
    expect(isPsychologistAdmin("psychologist")).toBe(false);
    expect(isClinicalPractitioner("psychologist_admin")).toBe(true);
    expect(isClinicalPractitioner("psychologist")).toBe(true);
    expect(isClinicalPractitioner("secretary")).toBe(false);
    expect(isSecretary("secretary")).toBe(true);
  });

  it("dado clínico só existe se a pessoa autenticada for a responsável", () => {
    expect(
      canAccessPatientClinical({
        role: "psychologist_admin",
        userId: "admin-1",
        responsiblePsychologistUserId: "psi-2",
      }),
    ).toBe(false);

    expect(
      canAccessPatientClinical({
        role: "psychologist_admin",
        userId: "admin-1",
        responsiblePsychologistUserId: "admin-1",
      }),
    ).toBe(true);

    expect(
      canAccessPatientClinical({
        role: "psychologist",
        userId: "psi-1",
        responsiblePsychologistUserId: "psi-1",
      }),
    ).toBe(true);

    expect(
      canAccessPatientClinical({
        role: "secretary",
        userId: "sec-1",
        responsiblePsychologistUserId: "sec-1",
      }),
    ).toBe(false);
  });
});
