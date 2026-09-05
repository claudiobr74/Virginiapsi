import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPOINTMENT_PRESENTATION_COLORS } from "@/features/calendar/appointment-visual";

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

describe("Clinical Pastel tokens", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

  it("define famílias pastéis namespaced, sem sobrescrever sage-700 primary", () => {
    expect(css).toContain("--tone-agenda-bg: #eef5ef");
    expect(css).toContain("--tone-clinical-bg: #f4f0fa");
    expect(css).toContain("--tone-finance-bg: #fff2ea");
    expect(css).toContain("--tone-tasks-bg: #fff8e6");
    expect(css).toContain("--tone-documents-bg: #eef5fb");
    expect(css).toContain("--tone-knowledge-bg: #ecf7f5");
    expect(css).toContain("--tone-settings-bg: #f8f3f0");
    expect(css).toMatch(/--sage-700:\s*#3a4f43/);
  });

  it("define superfícies pastéis da Agenda e preserva cores fortes só como acento", () => {
    expect(css).toContain("--agenda-active-bg: #eaf6ed");
    expect(css).toContain("--agenda-active-border: #a8d5b2");
    expect(css).toContain("--agenda-completed-bg: #edf4fc");
    expect(css).toContain("--agenda-completed-border: #b5cee9");
    expect(css).toContain("--agenda-unavailable-bg: #fceeee");
    expect(css).toContain("--agenda-unavailable-border: #e8b8b5");
    expect(css).toContain("--status-active: #34a853");
    expect(css).toContain("--status-completed: #1a73e8");
    expect(css).toContain("--status-cancelled: #d93025");
    expect(css).toContain("background-color: var(--agenda-active-bg)");
    expect(css).toContain("background-color: var(--agenda-completed-bg)");
    expect(css).toContain("background-color: var(--agenda-unavailable-bg)");
    expect(css).not.toMatch(/\[data-appointment-visual="active"\]\s*\{[^}]*background-color:\s*#34a853/);
  });

  it("mantém contraste AA do texto tonal sobre as superfícies pastéis", () => {
    const lightPairs = [
      APPOINTMENT_PRESENTATION_COLORS.active,
      APPOINTMENT_PRESENTATION_COLORS.completed,
      APPOINTMENT_PRESENTATION_COLORS.cancelled,
      APPOINTMENT_PRESENTATION_COLORS.unavailable,
    ];
    for (const palette of lightPairs) {
      expect(contrastRatio(palette.textColor, palette.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#1f2421", palette.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    }

    const darkPairs = [
      { text: "#c5ddcb", bg: "#1c2420" },
      { text: "#c5d7ea", bg: "#1a222c" },
      { text: "#e8c4c1", bg: "#2a1c1c" },
    ];
    for (const pair of darkPairs) {
      expect(contrastRatio(pair.text, pair.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#f4f7ee", pair.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
