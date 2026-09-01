import { describe, expect, it } from "vitest";
import {
  civilDateOrdinal,
  clientIsOnLaterCivilDate,
  dailyQuoteIndex,
  getDailyPsychologyQuote,
  nextLocalMidnightMs,
  quoteCivilDate,
  resolvePsychologyQuote,
} from "@/features/appearance/daily-quote";
import { PSYCHOLOGY_QUOTES } from "@/features/appearance/psychology-quotes";
import { zonedTimeToUtcIso } from "@/lib/utils/timezone";

describe("citação diária", () => {
  it("tem exatamente 30 frases próprias, sem atribuição", () => {
    expect(PSYCHOLOGY_QUOTES).toHaveLength(30);
    expect(new Set(PSYCHOLOGY_QUOTES).size).toBe(30);
    expect(PSYCHOLOGY_QUOTES[0]).toBe(
      "Escutar com presença é abrir espaço para que o outro também se escute.",
    );
    expect(PSYCHOLOGY_QUOTES[29]).toBe(
      "Uma escuta cuidadosa pode transformar silêncio em possibilidade de compreensão.",
    );
    const joined = PSYCHOLOGY_QUOTES.join(" ");
    expect(joined).not.toMatch(/Freud|Jung|Rogers|Beck|Frankl/i);
  });

  it("mesma data civil e fuso produzem a mesma citação", () => {
    const zone = "America/Sao_Paulo";
    const morning = new Date(zonedTimeToUtcIso("2026-03-15", "08:00", zone));
    const evening = new Date(zonedTimeToUtcIso("2026-03-15", "21:00", zone));
    expect(getDailyPsychologyQuote(zone, morning)).toBe(
      getDailyPsychologyQuote(zone, evening),
    );
  });

  it("23:59:59 local e 00:00:00 do dia seguinte usam índices consecutivos", () => {
    const zone = "America/Sao_Paulo";
    const midnight = Date.parse(zonedTimeToUtcIso("2026-03-16", "00:00", zone));
    const before = new Date(midnight - 1000);
    const after = new Date(midnight);
    const beforeIndex = dailyQuoteIndex("2026-03-15");
    const afterIndex = dailyQuoteIndex("2026-03-16");
    expect(getDailyPsychologyQuote(zone, before)).toBe(PSYCHOLOGY_QUOTES[beforeIndex]);
    expect(getDailyPsychologyQuote(zone, after)).toBe(PSYCHOLOGY_QUOTES[afterIndex]);
    expect(afterIndex).toBe((beforeIndex + 1) % 30);
  });

  it("depois do item 30 o ciclo volta ao item 1", () => {
    let wrapDay: string | null = null;
    for (let offset = 0; offset < 60; offset += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + offset));
      const civil = date.toISOString().slice(0, 10);
      if (dailyQuoteIndex(civil) === 29) {
        wrapDay = civil;
        break;
      }
    }
    expect(wrapDay).toBeTruthy();
    const [year, month, day] = wrapDay!.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    expect(dailyQuoteIndex(wrapDay!)).toBe(29);
    expect(PSYCHOLOGY_QUOTES[dailyQuoteIndex(wrapDay!)]).toBe(PSYCHOLOGY_QUOTES[29]);
    expect(dailyQuoteIndex(next)).toBe(0);
    expect(PSYCHOLOGY_QUOTES[dailyQuoteIndex(next)]).toBe(PSYCHOLOGY_QUOTES[0]);
    expect(civilDateOrdinal(next)).toBe(civilDateOrdinal(wrapDay!) + 1);
  });

  it("respeita a meia-noite do fuso da organização", () => {
    const instant = new Date("2026-01-01T02:00:00.000Z");
    const saoPaulo = getDailyPsychologyQuote("America/Sao_Paulo", instant);
    const auckland = getDailyPsychologyQuote("Pacific/Auckland", instant);
    expect(saoPaulo).not.toBe(auckland);
  });

  it("modo daily usa o banco e custom preserva a citação salva", () => {
    const zone = "America/Sao_Paulo";
    const now = new Date(zonedTimeToUtcIso("2026-06-01", "10:00", zone));
    const daily = resolvePsychologyQuote({
      mode: "daily",
      customQuote: "texto guardado",
      timeZone: zone,
      now,
    });
    const custom = resolvePsychologyQuote({
      mode: "custom",
      customQuote: "texto guardado",
      timeZone: zone,
      now,
    });
    const customEmpty = resolvePsychologyQuote({
      mode: "custom",
      customQuote: "  ",
      timeZone: zone,
      now,
    });
    expect(daily).toBe(getDailyPsychologyQuote(zone, now));
    expect(daily).not.toBe("texto guardado");
    expect(custom).toBe("texto guardado");
    expect(customEmpty).toBeNull();
  });

  it("nextLocalMidnightMs cai no dia civil seguinte à 00:00", () => {
    const zone = "America/Sao_Paulo";
    const now = new Date(zonedTimeToUtcIso("2026-03-15", "22:00", zone));
    const midnight = nextLocalMidnightMs(zone, now);
    expect(midnight).toBe(Date.parse(zonedTimeToUtcIso("2026-03-16", "00:00", zone)));
    expect(midnight).toBeGreaterThan(now.getTime());
  });

  it("detecta hidratação após a meia-noite local sem inventar data", () => {
    const zone = "America/Sao_Paulo";
    const beforeMidnight = new Date(Date.parse(zonedTimeToUtcIso("2026-03-16", "00:00", zone)) - 1000);
    const afterMidnight = new Date(zonedTimeToUtcIso("2026-03-16", "00:00", zone));
    const serverCivil = quoteCivilDate(zone, beforeMidnight);
    expect(serverCivil).toBe("2026-03-15");
    expect(clientIsOnLaterCivilDate(serverCivil, zone, beforeMidnight)).toBe(false);
    expect(clientIsOnLaterCivilDate(serverCivil, zone, afterMidnight)).toBe(true);
    expect(quoteCivilDate(zone, afterMidnight)).toBe("2026-03-16");
  });
});
