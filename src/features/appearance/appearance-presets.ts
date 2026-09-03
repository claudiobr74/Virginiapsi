export const APPEARANCE_PRESETS = ["sage", "serene", "warm", "essential"] as const;

export type AppearancePreset = (typeof APPEARANCE_PRESETS)[number];

export const DEFAULT_APPEARANCE_PRESET: AppearancePreset = "sage";

export const APPEARANCE_PRESET_OPTIONS: ReadonlyArray<{
  id: AppearancePreset;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "sage",
    label: "Sálvia",
    eyebrow: "Atual · padrão",
    description: "Creme, verde sálvia e o equilíbrio visual original do VirgíniaPsi.",
  },
  {
    id: "serene",
    label: "Sereno",
    eyebrow: "Azul acinzentado",
    description: "Azul petróleo e superfícies frias, com presença clínica e tranquila.",
  },
  {
    id: "warm",
    label: "Acolhedor",
    eyebrow: "Creme e terracota",
    description: "Tons quentes, rosé discreto e uma atmosfera de consultório acolhedora.",
  },
  {
    id: "essential",
    label: "Essencial",
    eyebrow: "Neutro e minimalista",
    description: "Menos cor, superfícies planas e tipografia contemporânea predominantemente sem serifa.",
  },
] as const;

export function parseAppearancePreset(value: unknown): AppearancePreset {
  return typeof value === "string" && (APPEARANCE_PRESETS as readonly string[]).includes(value)
    ? (value as AppearancePreset)
    : DEFAULT_APPEARANCE_PRESET;
}

export function applyAppearancePreset(preset: AppearancePreset): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiPreset = preset;
}
