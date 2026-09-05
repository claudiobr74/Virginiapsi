import type { LetterheadPreset, TypographyPreset } from "@/features/documents/branding-contracts";
import type { VisualProfile } from "@/features/documents/contracts";
import { VISUAL_PROFILE_LABELS } from "@/features/documents/contracts";

export const VISUAL_STYLE_ORDER = ["clinica", "essencial", "premium", "institucional"] as const;

export const VISUAL_STYLE_COPY: Record<
  VisualProfile,
  { label: string; kicker?: string; description: string }
> = {
  clinica: {
    label: VISUAL_PROFILE_LABELS.clinica,
    kicker: "Recomendado",
    description: "Equilibrado para o uso profissional diário",
  },
  essencial: {
    label: VISUAL_PROFILE_LABELS.essencial,
    description: "Limpo, leve e discreto",
  },
  premium: {
    label: VISUAL_PROFILE_LABELS.premium,
    description: "Refinado para documentos formais",
  },
  institucional: {
    label: VISUAL_PROFILE_LABELS.institucional,
    description: "Estrutura tradicional para clínica e instituição",
  },
};

export const TYPOGRAPHY_PRESET_LABELS: Record<TypographyPreset, string> = {
  classica: "Clássica",
  moderna: "Moderna",
  institucional: "Institucional",
  editorial: "Editorial",
};

export const LETTERHEAD_PRESET_LABELS: Record<LetterheadPreset, string> = {
  clinico: "Clínico",
  minimalista: "Minimalista",
  institucional: "Institucional",
  profissional: "Profissional",
  premium: "Elegante",
};

export const LOGO_VARIANT_LABELS: Record<string, string> = {
  principal: "Principal",
  horizontal: "Horizontal",
  compacta: "Compacta",
  monocromatica: "Monocromática",
  profissional: "Profissional",
  outra: "Outra",
};

export interface BrandingPalettePreset {
  id: "salvia" | "azul" | "terracota" | "neutra";
  label: string;
  colors: {
    primary: string;
    secondary: string;
    headings: string;
    dividers: string;
  };
}

export const BRANDING_PALETTES: BrandingPalettePreset[] = [
  {
    id: "salvia",
    label: "Sálvia",
    colors: {
      primary: "#3a4f43",
      secondary: "#8a8f8a",
      headings: "#171816",
      dividers: "#c5d0c6",
    },
  },
  {
    id: "azul",
    label: "Azul sereno",
    colors: {
      primary: "#3d5a73",
      secondary: "#7a8b99",
      headings: "#1b2833",
      dividers: "#c5d0d8",
    },
  },
  {
    id: "terracota",
    label: "Terracota suave",
    colors: {
      primary: "#8a5a4a",
      secondary: "#9a8478",
      headings: "#2a1c18",
      dividers: "#e2d4cc",
    },
  },
  {
    id: "neutra",
    label: "Neutra",
    colors: {
      primary: "#4a4a48",
      secondary: "#8a8a86",
      headings: "#1a1a18",
      dividers: "#d4d4ce",
    },
  },
];

export function profileTypography(profile: VisualProfile): TypographyPreset {
  if (profile === "essencial") return "moderna";
  if (profile === "institucional") return "institucional";
  if (profile === "premium") return "editorial";
  return "classica";
}

export function letterheadToProfile(letterhead: LetterheadPreset): VisualProfile | null {
  if (letterhead === "minimalista") return "essencial";
  if (letterhead === "institucional") return "institucional";
  if (letterhead === "premium") return "premium";
  if (letterhead === "clinico") return "clinica";
  return null;
}

export function matchBrandingPalette(colors: {
  primary: string;
  secondary: string;
  headings: string;
  dividers: string;
}): BrandingPalettePreset["id"] | "custom" {
  const found = BRANDING_PALETTES.find(
    (palette) =>
      palette.colors.primary.toLowerCase() === colors.primary.toLowerCase() &&
      palette.colors.secondary.toLowerCase() === colors.secondary.toLowerCase() &&
      palette.colors.headings.toLowerCase() === colors.headings.toLowerCase() &&
      palette.colors.dividers.toLowerCase() === colors.dividers.toLowerCase(),
  );
  return found?.id ?? "custom";
}
