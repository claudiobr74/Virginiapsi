import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalTrigger } from "@/components/ui/modal";

describe("Modal", () => {
  it("abre ao clicar no trigger e fecha ao clicar em fechar", async () => {
    render(
      <Modal>
        <ModalTrigger asChild>
          <Button>Abrir</Button>
        </ModalTrigger>
        <ModalContent title="Título de teste" description="Descrição de teste">
          Conteúdo
        </ModalContent>
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Título de teste")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
