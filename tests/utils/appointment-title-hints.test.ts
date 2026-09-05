import { describe, expect, it } from "vitest";
import { extractAppointmentTitleHints } from "@/features/calendar/appointment-title-hints";

describe("extractAppointmentTitleHints", () => {
  it("extrai um nome com sufixo de sessão", () => {
    expect(extractAppointmentTitleHints("Jessyca-1(c)")).toEqual(["Jessyca"]);
  });

  it("não escolhe entre dois nomes", () => {
    expect(extractAppointmentTitleHints("Livia-1(c) / Flávia-3")).toEqual([
      "Livia",
      "Flávia",
    ]);
  });

  it("separa nomes compostos por barra", () => {
    expect(extractAppointmentTitleHints("Camila lacerda-1(c)/ Ana Clara-2")).toEqual([
      "Camila lacerda",
      "Ana Clara",
    ]);
  });

  it("não resolve interrogação como vínculo", () => {
    expect(extractAppointmentTitleHints("Ygor??? Manuela??")).toEqual(["Ygor", "Manuela"]);
  });
});
