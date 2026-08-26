import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/integrations/google/calendar-client";
import { googleCalendarListErrorMessage } from "@/lib/integrations/google/errors";

describe("googleCalendarListErrorMessage", () => {
  it("explica Calendar API desativada sem vazar o corpo cru", () => {
    const message = googleCalendarListErrorMessage(
      new GoogleApiError("Google Calendar API request failed: 403", 403, {
        error: {
          message:
            "Google Calendar API has not been used in project 372179406522 before or it is disabled.",
        },
      }),
    );
    expect(message).toMatch(/API Google Calendar ainda não está ativada/);
    expect(message).not.toContain("372179406522");
  });

  it("pede reconexão quando o token expirou", () => {
    expect(
      googleCalendarListErrorMessage(
        new GoogleApiError("Google Calendar API request failed: 401", 401),
      ),
    ).toMatch(/expirou/);
  });

  it("não deixa a UI presa quando a listagem falha por outro motivo", () => {
    expect(googleCalendarListErrorMessage(new Error("boom"))).toMatch(
      /Não foi possível listar os calendários/,
    );
  });
});
