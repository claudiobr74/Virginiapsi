import { describe, expect, it } from "vitest";
import { defaultPracticeSettings } from "@/features/settings/contracts";

describe("defaultPracticeSettings", () => {
  it("abre Configurações com defaults quando a linha ainda não existe", () => {
    const row = defaultPracticeSettings("11111111-1111-4111-8111-111111111111");
    expect(row.session_duration_minutes).toBe(50);
    expect(row.secretary_finance_access).toBe("none");
    expect(row.inactivity_timeout_minutes).toBe(15);
  });
});
