import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renderiza o texto e responde ao clique", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);

    const button = screen.getByRole("button", { name: "Salvar" });
    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fica desabilitado e não dispara clique durante isLoading", async () => {
    const onClick = vi.fn();
    render(
      <Button isLoading onClick={onClick}>
        Enviando
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Enviando" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("aplica a classe do variant destructive", () => {
    render(<Button variant="destructive">Excluir</Button>);
    expect(screen.getByRole("button", { name: "Excluir" })).toHaveClass(
      "bg-failed",
    );
  });

  it("asChild funde as props num único elemento filho (regressão do Radix Slot)", () => {
    // Slot exige exatamente um elemento React filho. Um bug aqui já quebrou
    // toda tela que usa <Button asChild><Link>...</Link></Button>.
    render(
      <Button asChild>
        <a href="/destino">Ir</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Ir" });
    expect(link).toHaveAttribute("href", "/destino");
    expect(link.tagName).toBe("A");
    expect(link).toHaveClass("bg-primary");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asChild com isLoading não injeta um spinner extra no filho", () => {
    render(
      <Button asChild isLoading>
        <a href="/destino">Ir</a>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "Ir" })).toBeInTheDocument();
  });
});
