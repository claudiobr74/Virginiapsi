import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  upsertDocumentBrandingAction,
  requestLogoPreviewUrlAction,
  requestLogoUploadUrlAction,
  registerLogoAction,
  setDefaultLogoAction,
  refresh,
} = vi.hoisted(() => ({
  upsertDocumentBrandingAction: vi.fn(async () => ({ id: "org" })),
  requestLogoPreviewUrlAction: vi.fn(async () => ({ url: null })),
  requestLogoUploadUrlAction: vi.fn(async () => ({ error: "skip" })),
  registerLogoAction: vi.fn(async () => ({})),
  setDefaultLogoAction: vi.fn(async () => ({})),
  refresh: vi.fn(),
}));

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
    expect(screen.getByRole("checkbox", { name: "CRP" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Cidade/UF" })).toBeInTheDocument();
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
    expect(screen.getByTestId("branding-a4-page")).toHaveTextContent("Ana Serena");
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

  it("navega os estilos pelo teclado e não chama o servidor", async () => {
    const user = userEvent.setup();
    render(<BrandingSettingsPanel branding={null} logos={[]} />);
    screen.getByRole("radio", { name: /Clínico/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /Minimalista/ })).toHaveAttribute("aria-checked", "true");
    expect(upsertDocumentBrandingAction).not.toHaveBeenCalled();
  });

  it("folha A4 permanece clara em dark mode", () => {
    render(
      <div className="dark bg-zinc-950">
        <BrandingSettingsPanel branding={null} logos={[]} />
      </div>,
    );
    expect(screen.getByTestId("branding-a4-page").className).toMatch(/bg-white/);
  });

  it("trocar paleta atualiza as cores da prévia", async () => {
    const user = userEvent.setup();
    render(
      <BrandingSettingsPanel
        branding={null}
        logos={[]}
        fallback={{ professionalName: "Ana Serena" }}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Terracota suave" }));
    expect(screen.getByRole("radio", { name: "Terracota suave" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const heading = screen.getByTestId("branding-a4-page").querySelector("header p");
    expect(heading).toHaveStyle({ color: "#2a1c18" });
  });

  it("logo aparece na folha A4 sem salvar a identidade", async () => {
    requestLogoPreviewUrlAction.mockResolvedValue({ url: "https://signed.example/logo.png" });
    render(
      <BrandingSettingsPanel
        branding={null}
        logos={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            organization_id: "11111111-1111-4111-8111-111111111111",
            variant: "principal",
            label: "marca",
            storage_path: "org/logos/a.png",
            print_storage_path: "org/logos/a.png",
            mime_type: "image/png",
            byte_size: 12,
            sha256: "ab",
            width_px: null,
            height_px: null,
            is_default: true,
            created_at: "2026-09-02T00:00:00.000Z",
          },
        ]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Logo da identidade visual" })).toHaveAttribute(
        "src",
        "https://signed.example/logo.png",
      );
    });
    expect(upsertDocumentBrandingAction).not.toHaveBeenCalled();
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
    expect(screen.getByLabelText("Variante da logo")).toBeInTheDocument();
    expect(screen.getByText("Antecedência de cancelamento (horas)")).toBeInTheDocument();
    expect(screen.getByText(/cláusula informativa de IA/i)).toBeInTheDocument();
  });
});
