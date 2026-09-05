import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE_PRESET,
  parseAppearancePreset,
} from "@/features/appearance/appearance-presets";

const ROOT = path.resolve(__dirname, "../..");

describe("appearance presets", () => {
  it("keeps Sálvia as the safe default", () => {
    expect(DEFAULT_APPEARANCE_PRESET).toBe("sage");
    expect(parseAppearancePreset(undefined)).toBe("sage");
    expect(parseAppearancePreset("unknown")).toBe("sage");
  });

  it("accepts the four product presets", () => {
    expect(APPEARANCE_PRESETS).toEqual(["sage", "serene", "warm", "essential"]);
    for (const preset of APPEARANCE_PRESETS) {
      expect(parseAppearancePreset(preset)).toBe(preset);
    }
  });

  it("ships light and dark token packs only for the three alternate styles", () => {
    const css = readFileSync(path.join(ROOT, "src/app/appearance-presets.css"), "utf8");
    expect(css).not.toContain('html[data-ui-preset="sage"]');
    for (const preset of ["serene", "warm", "essential"]) {
      expect(css).toContain(`html[data-ui-preset="${preset}"]`);
      expect(css).toContain(`html.dark[data-ui-preset="${preset}"]`);
    }
  });

  it("keeps the preset independent from next-themes", () => {
    const css = readFileSync(path.join(ROOT, "src/app/appearance-presets.css"), "utf8");
    expect(css).toContain('data-ui-preset="serene"');
    expect(css).toContain('dark[data-ui-preset="serene"]');
  });
});
