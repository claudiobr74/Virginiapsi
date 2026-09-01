import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewDocumentWizard } from "@/features/documents/components/new-document-wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

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
  createStudioDocumentAction: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
}));

const patients = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    preferred_name: "Ana",
    full_name: "Ana Silva",
  },
];

describe("NewDocumentWizard", () => {
  it("sem template pede primeiro a escolha do documento", () => {
    render(<NewDocumentWizard patients={patients} />);
    expect(screen.getByRole("heading", { name: "Que documento você quer criar?" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar um modelo...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar documento" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modelo")).not.toBeInTheDocument();
  });

  it("com template pré-selecionado não repete a escolha e usa Criar documento", () => {
    render(
      <NewDocumentWizard patients={patients} initialTemplateKey="declaration_attendance" />,
    );
    expect(screen.getByRole("heading", { name: "Declaração de comparecimento" })).toBeInTheDocument();
    expect(screen.getByText("modelo selecionado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar modelo" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Que documento você quer criar?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Paciente")).toBeInTheDocument();
    expect(screen.queryByText("Paciente (opcional)")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Para que este documento será usado?")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Nome do destinatário, quando houver")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Adicionar detalhes" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Formato")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar documento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar estrutura" })).not.toBeInTheDocument();
  });

  it("mostra destinatário na superfície quando o template exige", () => {
    render(
      <NewDocumentWizard patients={patients} initialTemplateKey="report_to_psychiatrist" />,
    );
    expect(screen.getByPlaceholderText("Nome do destinatário, quando houver")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Adicionar detalhes" })).not.toBeInTheDocument();
  });

  it("respeita paciente opcional no parecer", () => {
    render(<NewDocumentWizard patients={patients} initialTemplateKey="psychological_opinion" />);
    expect(screen.getByText("Paciente (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Paciente")).toHaveTextContent("Sem paciente");
  });

  it("mantém formato do livreto em opções avançadas", async () => {
    const user = userEvent.setup();
    render(
      <NewDocumentWizard patients={patients} initialTemplateKey="psychotherapy_contract_complete" />,
    );
    expect(screen.getByRole("button", { name: "+ Adicionar finalidade" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Formato")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Opções do documento" }));
    expect(screen.getByLabelText("Formato")).toHaveValue("livreto");
  });
});
