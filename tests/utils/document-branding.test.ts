import { describe, expect, it } from "vitest";
import { updateBrandingSchema } from "@/features/documents/branding-contracts";
import {
  applyVisualStyleToForm,
  brandingFormFromRow,
  brandingFormToRow,
  brandingFormToUpdateInput,
  buildDocumentBrandingPersistRow,
  restoreRecommendedVisual,
} from "@/features/documents/branding-form";
import { buildLetterheadFooterLines, buildLetterheadHeaderLines } from "@/features/documents/branding-layout";
import { BRANDING_PALETTES, matchBrandingPalette, profileTypography } from "@/features/documents/branding-presets";
import {
  defaultBranding,
  profileLetterhead,
  resolveBranding,
  resolveCreatedDocumentVisualProfile,
  RECOMMENDED_BRANDING_VISIBILITY,
} from "@/features/documents/branding-resolve";

describe("defaultVisualProfile roundtrip", () => {
  it("o schema aceita o perfil enviado pela UI", () => {
    for (const profile of ["clinica", "essencial", "institucional", "premium"] as const) {
      const parsed = updateBrandingSchema.parse({
        defaultVisualProfile: profile,
        letterheadPreset: profileLetterhead(profile),
      });
      expect(parsed.defaultVisualProfile).toBe(profile);
    }
  });

  it("o payload da UI inclui defaultVisualProfile", () => {
    const form = applyVisualStyleToForm(brandingFormFromRow(null), "essencial");
    const payload = brandingFormToUpdateInput(form);
    expect(payload.defaultVisualProfile).toBe("essencial");
    expect(payload.letterheadPreset).toBe("minimalista");
    expect(payload.typographyPreset).toBe("moderna");
  });

  it("insert e update persistem o perfil visual", () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const inserted = buildDocumentBrandingPersistRow(
      { defaultVisualProfile: "essencial", letterheadPreset: "minimalista" },
      defaultBranding(),
      organizationId,
    );
    expect(inserted.default_visual_profile).toBe("essencial");
    expect(inserted.letterhead_preset).toBe("minimalista");

    const existing = defaultBranding();
    existing.default_visual_profile = "clinica";
    existing.letterhead_preset = "clinico";
    const updated = buildDocumentBrandingPersistRow(
      { defaultVisualProfile: "premium", letterheadPreset: "premium" },
      existing,
      organizationId,
    );
    expect(updated.default_visual_profile).toBe("premium");
    expect(updated.letterhead_preset).toBe("premium");
  });

  it("sem o campo na UI, o fallback permanece o valor já salvo — não descarta o perfil", () => {
    const existing = defaultBranding();
    existing.default_visual_profile = "premium";
    const row = buildDocumentBrandingPersistRow(
      { colorPrimary: "#3d5a73" },
      existing,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(row.default_visual_profile).toBe("premium");
  });

  it("reload reconstrói o estado inicial a partir da linha salva", () => {
    const saved = defaultBranding();
    saved.default_visual_profile = "essencial";
    saved.letterhead_preset = "minimalista";
    saved.typography_preset = "moderna";
    const form = brandingFormFromRow(saved);
    expect(form.defaultVisualProfile).toBe("essencial");
    expect(form.letterheadPreset).toBe("minimalista");
    expect(brandingFormToUpdateInput(form).defaultVisualProfile).toBe("essencial");
  });
});

describe("identidade recomendada e branding existente", () => {
  it("sem branding salvo, o formulário nasce em Clínico com defaults recomendados", () => {
    const form = brandingFormFromRow(null);
    expect(form.defaultVisualProfile).toBe("clinica");
    expect(form.letterheadPreset).toBe("clinico");
    expect(form.headerProfessional).toBe(true);
    expect(form.headerCrp).toBe(true);
    expect(form.headerLogo).toBe(true);
    expect(form.footerPageNumbers).toBe(true);
    expect(form.footerDocumentId).toBe(false);
    expect(form.footerVersion).toBe(false);
    expect(form.footerHash).toBe(false);
    expect(form.headerAddress).toBe(false);
    expect(form.showWebsite).toBe(false);
    expect(form.showTaxId).toBe(false);
    expect(form.footerPhone).toBe(RECOMMENDED_BRANDING_VISIBILITY.footer_phone);
    expect(form.footerEmail).toBe(true);
  });

  it("branding existente customizado não é sobrescrito na reconstrução do form", () => {
    const saved = defaultBranding();
    saved.default_visual_profile = "premium";
    saved.letterhead_preset = "premium";
    saved.color_primary = "#8a5a4a";
    saved.header_crp = false;
    saved.footer_document_id = true;
    saved.professional_name = "Virgínia Macedo";
    const form = brandingFormFromRow(saved);
    expect(form.defaultVisualProfile).toBe("premium");
    expect(form.colorPrimary).toBe("#8a5a4a");
    expect(form.headerCrp).toBe(false);
    expect(form.footerDocumentId).toBe(true);
    expect(form.professionalName).toBe("Virgínia Macedo");
  });

  it("restaurar padrão recomendado aplica Clínico sem apagar dados cadastrais", () => {
    const form = brandingFormFromRow(null);
    form.professionalName = "Virgínia Macedo";
    form.clinicName = "Clínica Recriar";
    form.crp = "09/12345";
    const restored = restoreRecommendedVisual(
      applyVisualStyleToForm({ ...form, footerDocumentId: true }, "premium"),
    );
    expect(restored.defaultVisualProfile).toBe("clinica");
    expect(restored.letterheadPreset).toBe("clinico");
    expect(restored.footerDocumentId).toBe(false);
    expect(restored.professionalName).toBe("Virgínia Macedo");
    expect(restored.clinicName).toBe("Clínica Recriar");
    expect(restored.crp).toBe("09/12345");
  });
});

describe("criação de documento e renderer", () => {
  it("documento novo usa o perfil salvo da organização quando houver branding", () => {
    expect(
      resolveCreatedDocumentVisualProfile({ default_visual_profile: "essencial" }, "institucional"),
    ).toBe("essencial");
    expect(resolveCreatedDocumentVisualProfile(null, "institucional")).toBe("institucional");
  });

  it("resolveBranding honra o perfil visual no letterhead e reutiliza fallbacks", () => {
    const resolved = resolveBranding(
      brandingFormToRow(applyVisualStyleToForm(brandingFormFromRow(null), "premium")),
      {
        professionalName: "Virgínia Macedo",
        professionalTitle: "Psicóloga clínica",
        crp: "09/12345",
        clinicName: "Clínica Recriar",
        email: "virginia@example.com",
      },
      "premium",
    );
    expect(resolved.letterhead).toBe("premium");
    expect(resolved.professionalName).toBe("Virgínia Macedo");
    expect(resolved.professionalTitle).toBe("Psicóloga clínica");
    expect(resolved.crpLabel).toContain("09/12345");
    expect(resolved.clinicName).toBe("Clínica Recriar");
    expect(resolved.email).toBe("virginia@example.com");
    expect(resolved.typography).toBe("editorial");
  });

  it("o PDF/renderer reutiliza o subtítulo do consultório como título profissional", () => {
    const resolved = resolveBranding(
      null,
      {
        professionalName: "Ana Serena",
        professionalTitle: "Psicóloga clínica",
        crp: "09/00000",
      },
      "clinica",
    );
    const header = buildLetterheadHeaderLines(resolved);
    expect(header.some((line) => line.text === "Psicóloga clínica")).toBe(true);
    expect(header.some((line) => line.text.includes("Ana Serena"))).toBe(true);
  });

  it("desmarcar CRP remove o rótulo do cabeçalho compartilhado", () => {
    const form = brandingFormFromRow(null);
    form.headerCrp = false;
    const resolved = resolveBranding(
      brandingFormToRow(form),
      { professionalName: "Ana", crp: "01/00000" },
      "clinica",
    );
    const header = buildLetterheadHeaderLines(resolved);
    expect(header.some((line) => /CRP/.test(line.text))).toBe(false);
    expect(header.some((line) => line.text.includes("Ana"))).toBe(true);
  });

  it("rodapé recomendado inclui contato e paginação, sem identificadores técnicos", () => {
    const resolved = resolveBranding(null, {
      phone: "(62) 99999-0000",
      email: "contato@example.com",
      clinicName: "Clínica",
    });
    const footer = buildLetterheadFooterLines(resolved, {
      pageIndex: 0,
      pageCount: 1,
      documentId: "local",
      version: 1,
    });
    expect(footer.some((line) => line.includes("Página 1 de 1"))).toBe(true);
    expect(footer.some((line) => line.includes("99999") || line.includes("contato@"))).toBe(true);
    expect(footer.some((line) => line.startsWith("ID "))).toBe(false);
  });
});

describe("paletas e tipografia dos modelos", () => {
  it("presets só preenchem os quatro campos de cor existentes", () => {
    for (const palette of BRANDING_PALETTES) {
      expect(palette.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(matchBrandingPalette(palette.colors)).toBe(palette.id);
    }
    expect(
      matchBrandingPalette({
        primary: "#123456",
        secondary: "#123456",
        headings: "#123456",
        dividers: "#123456",
      }),
    ).toBe("custom");
  });

  it("cada modelo escolhe tipografia e letterhead coerentes", () => {
    expect(profileLetterhead("clinica")).toBe("clinico");
    expect(profileLetterhead("essencial")).toBe("minimalista");
    expect(profileLetterhead("institucional")).toBe("institucional");
    expect(profileLetterhead("premium")).toBe("premium");
    expect(profileTypography("clinica")).toBe("classica");
    expect(profileTypography("essencial")).toBe("moderna");
    expect(profileTypography("institucional")).toBe("institucional");
    expect(profileTypography("premium")).toBe("editorial");
  });
});
