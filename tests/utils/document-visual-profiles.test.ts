import { describe, expect, it } from "vitest";
import { getVisualProfileLayout, VISUAL_PROFILE_LAYOUTS } from "@/features/documents/branding-layout";
import { applyVisualStyleToForm, brandingFormFromRow } from "@/features/documents/branding-form";

describe("document visual profiles v3", () => {
  it("mantém quatro layouts canônicos e estruturalmente distintos", () => {
    const clinical = getVisualProfileLayout("clinica");
    const minimal = getVisualProfileLayout("essencial");
    const elegant = getVisualProfileLayout("premium");
    const institutional = getVisualProfileLayout("institucional");

    expect(Object.keys(VISUAL_PROFILE_LAYOUTS)).toHaveLength(4);
    expect(clinical.headerComposition).toBe("professional");
    expect(minimal.headerComposition).toBe("minimal");
    expect(elegant.headerComposition).toBe("editorial");
    expect(institutional.headerComposition).toBe("institutional");

    expect(clinical.titleAlignment).toBe("left");
    expect(minimal.divider).toBe("none");
    expect(elegant.titleAlignment).toBe("center");
    expect(elegant.logoAlignment).toBe("center");
    expect(institutional.divider).toBe("strong");
    expect(institutional.footerStyle).toBe("institutional");
  });

  it("diferencia margens, densidade e assinatura sem depender de cor", () => {
    const profiles = ["clinica", "essencial", "premium", "institucional"] as const;
    const layouts = profiles.map(getVisualProfileLayout);

    expect(new Set(layouts.map((item) => JSON.stringify(item.margins))).size).toBe(4);
    expect(getVisualProfileLayout("essencial").margins.left).toBeGreaterThan(
      getVisualProfileLayout("institucional").margins.left,
    );
    expect(getVisualProfileLayout("premium").bodyMaxWidthRatio).toBeLessThan(1);
    expect(getVisualProfileLayout("clinica").signatureAlignment).toBe("right");
    expect(getVisualProfileLayout("premium").signatureAlignment).toBe("center");
  });

  it("trocar estilo preserva paleta e dados da identidade", () => {
    const initial = brandingFormFromRow(null);
    initial.professionalName = "Virgínia Exemplo";
    initial.clinicName = "Clínica Exemplo";
    initial.crp = "09/12345";
    initial.colorPrimary = "#8a5a4a";
    initial.colorSecondary = "#9a8478";
    initial.colorHeadings = "#2a1c18";
    initial.colorDividers = "#e2d4cc";

    const elegant = applyVisualStyleToForm(initial, "premium");

    expect(elegant.defaultVisualProfile).toBe("premium");
    expect(elegant.professionalName).toBe("Virgínia Exemplo");
    expect(elegant.clinicName).toBe("Clínica Exemplo");
    expect(elegant.crp).toBe("09/12345");
    expect(elegant.colorPrimary).toBe("#8a5a4a");
    expect(elegant.colorSecondary).toBe("#9a8478");
    expect(elegant.colorHeadings).toBe("#2a1c18");
    expect(elegant.colorDividers).toBe("#e2d4cc");
  });
});
