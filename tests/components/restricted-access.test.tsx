import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestrictedAccess } from "@/features/shell/restricted-access";

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

describe("RestrictedAccess", () => {
  it("explica a restrição e aponta de volta ao Meu Dia", () => {
    render(<RestrictedAccess sectionLabel="o Conhecimento clínico" />);

    expect(
      screen.getByRole("heading", { name: "Acesso restrito" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Você não tem permissão para abrir o Conhecimento clínico/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Seu perfil atual: Secretaria/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao Início" })).toHaveAttribute(
      "href",
      "/app",
    );
  });
});
