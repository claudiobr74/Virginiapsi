import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentStudioHome } from "@/features/documents/components/document-studio-home";
import { documentRowSchema, type DocumentRow } from "@/features/documents/contracts";
import { TEMPLATE_CATEGORY_LABELS } from "@/features/documents/system-templates";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/documents/studio-actions", () => ({
  toggleTemplateFavoriteAction: vi.fn(async () => ({})),
}));

function doc(overrides: Partial<DocumentRow> & { id: string; title: string }): DocumentRow {
  return documentRowSchema.parse({
    organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    patient_id: "44444444-4444-4444-8444-444444444444",
    template_id: null,
    document_kind: "declaracao",
    sensitivity: "clinical",
    status: "draft",
    current_version: 1,
    issued_at: null,
    canceled_at: null,
    created_at: "2026-09-01T12:00:00.000Z",
    system_template_key: "declaration_attendance",
    ...overrides,
  });
}

const recentDocuments = Array.from({ length: 6 }, (_, index) =>
  doc({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa${String(index + 10)}`,
    title: `Documento ${index + 1}`,
    system_template_key:
      index === 0 ? "declaration_attendance" : index === 1 ? "psychological_report_complete" : "declaration_attendance",
  }),
);

describe("DocumentStudioHome", () => {
  it("mostra atalhos e esconde o catálogo completo por padrão", () => {
    render(
      <DocumentStudioHome
        documents={[]}
        patientNames={{}}
        favorites={[]}
        isAdmin={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "O que você quer criar?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Declaração/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Relatório/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mais modelos/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar um modelo...")).toBeInTheDocument();

    for (const label of Object.values(TEMPLATE_CATEGORY_LABELS)) {
      expect(screen.queryByRole("heading", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText("Gerenciar modelos")).not.toBeInTheDocument();
    expect(screen.queryByText(/modelos são gerenciados/i)).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum documento ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Criar primeiro documento/ })).toBeInTheDocument();
  });

  it("abre todos os modelos, favoritos e recentes sem ocupar a home", async () => {
    const user = userEvent.setup();
    render(
      <DocumentStudioHome
        documents={recentDocuments}
        patientNames={{ "44444444-4444-4444-8444-444444444444": "Ana" }}
        favorites={["declaration_attendance"]}
        isAdmin
      />,
    );

    expect(screen.getByText("Usados recentemente")).toBeInTheDocument();
    expect(screen.getByText("Favoritos")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Declaração de comparecimento" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Documento 1")).toBeInTheDocument();
    expect(screen.getByText("Documento 5")).toBeInTheDocument();
    expect(screen.queryByText("Documento 6")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ver todos$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gerenciar modelos" })).toHaveAttribute(
      "href",
      "/app/documents/templates",
    );

    await user.click(screen.getByRole("button", { name: "Ver todos os modelos" }));
    expect(screen.getByRole("heading", { name: "Todos os modelos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Declarações" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Administrativos" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Favoritar" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Usar modelo" }).length).toBeGreaterThan(0);
  });

  it("não mostra bloco de favoritos vazio", () => {
    render(
      <DocumentStudioHome documents={[]} patientNames={{}} favorites={[]} isAdmin={false} />,
    );
    expect(screen.queryByText("Favoritos")).not.toBeInTheDocument();
  });
});
