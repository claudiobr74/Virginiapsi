import { describe, expect, it } from "vitest";
import {
  CLINICAL_DELETE_BLOCKED,
  hardDeleteBlockedReason,
} from "@/features/calendar/appointment-delete-guard";

describe("hardDeleteBlockedReason", () => {
  it("bloqueia exclusão definitiva quando há registro clínico", () => {
    expect(hardDeleteBlockedReason(true)).toBe(CLINICAL_DELETE_BLOCKED);
    expect(CLINICAL_DELETE_BLOCKED).toContain("registro clínico associado");
  });

  it("permite exclusão quando não há registro clínico", () => {
    expect(hardDeleteBlockedReason(false)).toBeNull();
  });
});
