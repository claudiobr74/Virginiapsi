import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertDocumentBrandingAction = vi.fn(async () => ({ id: "org" }));
const requestLogoPreviewUrlAction = vi.fn(async () => ({ url: null }));
const requestLogoUploadUrlAction = vi.fn(async () => ({ error: "skip" }));
const registerLogoAction = vi.fn(async () => ({}));
const setDefaultLogoAction = vi.fn(async () => ({}));
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/features/documents/branding-actions", () => ({
  upsertDocumentBrandingAction,
  requestLogoPreviewUrlAction,
  requestLogoUploadUrlAction,
  registerLogoAction,
  setDefaultLogoAction,
}));

import { BrandingSettingsPanel } from "@/features/documents/components/branding-settings-panel";
import { defaultBranding } from "@/features/documents/branding-resolve";

describe("BrandingSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seleciona Clínico por padrão e não mostra IDs internos", () => {
    render(<BrandingSettingsPanel branding={null} logos={[]} />);
    expect(screen.getByRole("radio", { name: /Clínico/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Salvar identidade visual" })).toBeInTheDocument();
    expect(screen.getByText(/Escolha como seus documentos serão apresentados/)).toBeInTheDocument();
    expect(screen.queryByText("defaultVisualProfile")).not.toBeInTheDocument();
    expect(screen.queryByText("letterheadPreset")).not.toBeInTheDocument();
    expect(screen.queryByText("clinica")).not.toBeInTheDocument();
    expect(screen.queryByText("essencial")).not.toBeInTheDocument();
    expect(screen.queryByText("premium")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opções avançadas" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("preserva branding existente na seleção do modelo", () => {
    const saved = defaultBranding();
    saved.default_visual_profile = "essencial";
    saved.letterhead_preset = "minimalista";
    saved.professional_name = "Virgínia Macedo";
    render(<BrandingSettingsPanel branding={saved} logos={[]} />);
    expect(screen.getByRole("radio", { name: /Minimalista/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByText(/Virgínia Macedo/).length).toBeGreaterThan(0);
  });

  it("atualiza a prévia ao trocar o modelo sem salvar", async () => {
    const user = userEvent.setup();
    render(
      <BrandingSettingsPanel
        branding={null}
        logos={[]}
        fallback={{ professionalName: "Ana Serena", crp: "09/00000" }}
      />,
    );
    expect(screen.getByTestId("branding-a4-page")).toHaveTextContent("Ana Serena");
    expect(screen.getByTestId("branding-a4-page")).toHaveTextContent("CRP 09/00000");
    await user.click(screen.getByRole("radio", { name: /Minimalista/ }));
    expect(upsertDocumentBrandingAction).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /Minimalista/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
  });

  it("desmarcar CRP remove o dado da prévia", async () => {
    const user = userEvent.setup();
    render(
      <BrandingSettingsPanel
        branding={null}
        logos={[]}
        fallback={{ professionalName: "Ana Serena", crp: "09/00000" }}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "CRP" }));
    expect(screen.getByTestId("branding-a4-page")).not.toHaveTextContent("CRP 09/00000");
    expect(screen.getByTestId("branding-a4-page")).toHaveTextContent("Ana Serena");
  });

  it("salvar envia defaultVisualProfile do modelo escolhido", async () => {
    const user = userEvent.setup();
    render(<BrandingSettingsPanel branding={null} logos={[]} />);
    await user.click(screen.getByRole("radio", { name: /Elegante/ }));
    await user.click(screen.getByRole("button", { name: "Salvar identidade visual" }));
    expect(upsertDocumentBrandingAction).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultVisualProfile: "premium",
        letterheadPreset: "premium",
      }),
    );
  });

  it("trocar paleta atualiza as cores da prévia", async () => {
    const user = userEvent.setup();
    render(<BrandingSettingsPanel branding={null} logos={[]} />);
    await user.click(screen.getByRole("radio", { name: "Terracota suave" }));
    expect(screen.getByRole("radio", { name: "Terracota suave" })).toHaveAttribute("aria-checked", "true");
  });

  it("opções avançadas continuam acessíveis", async () => {
    const user = userEvent.setup();
    render(<BrandingSettingsPanel branding={null} logos={[]} />);
    await user.click(screen.getByRole("button", { name: /Opções avançadas/ }));
    expect(screen.getByRole("button", { name: /Opções avançadas/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Tipografia")).toBeInTheDocument();
    expect(screen.getByText("Antecedência de cancelamento (horas)")).toBeInTheDocument();
    expect(screen.getByText(/cláusula informativa de IA/i)).toBeInTheDocument();
  });
});
