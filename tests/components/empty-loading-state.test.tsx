import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";

describe("EmptyState", () => {
  it("renderiza título, descrição e ação", () => {
    render(
      <EmptyState
        title="Nenhum paciente"
        description="Cadastre o primeiro paciente"
        action={<button type="button">Novo paciente</button>}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Nenhum paciente")).toBeInTheDocument();
    expect(screen.getByText("Cadastre o primeiro paciente")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Novo paciente" }),
    ).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("expõe status acessível com o rótulo informado", () => {
    render(<LoadingState label="Carregando pacientes…" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Carregando pacientes…",
    );
  });
});
