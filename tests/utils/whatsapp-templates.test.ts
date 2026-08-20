import { describe, expect, it } from "vitest";
import { parseInboundIntent, renderTemplate } from "@/features/communications/templates";

describe("renderTemplate", () => {
  it("substitui placeholders administrativos", () => {
    expect(
      renderTemplate("Olá, {{patient_name}}! Sessão em {{starts_at}}.", {
        patientName: "Beatriz",
        startsAt: "sexta, 21/08, 14:00",
      }),
    ).toBe("Olá, Beatriz! Sessão em sexta, 21/08, 14:00.");
  });
});

describe("parseInboundIntent — conservador", () => {
  it("confirma só com SIM/confirmo explícitos", () => {
    expect(parseInboundIntent("SIM")).toBe("confirm");
    expect(parseInboundIntent("confirmo!")).toBe("confirm");
    expect(parseInboundIntent("Confirmado")).toBe("confirm");
  });

  it("não remarca nem cancela com texto ambíguo", () => {
    expect(parseInboundIntent("ok")).toBe("unknown");
    expect(parseInboundIntent("talvez")).toBe("unknown");
    expect(parseInboundIntent("podemos ver outro dia?")).toBe("unknown");
    expect(parseInboundIntent("")).toBe("unknown");
  });

  it("marca remarcação e recusa só com palavras explícitas", () => {
    expect(parseInboundIntent("preciso remarcar")).toBe("reschedule_pending");
    expect(parseInboundIntent("nao")).toBe("decline_pending");
    expect(parseInboundIntent("cancelar")).toBe("decline_pending");
  });
});
