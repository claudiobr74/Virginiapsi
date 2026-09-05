import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DpepForm } from "@/features/sessions/components/dpep-form";
import {
  SESSION_AI_DRAFT_BANNER,
  SESSION_AI_EMPTY_CONTEXT_MESSAGE,
  SESSION_AI_USER_ERROR,
} from "@/features/sessions/ai/messages";

const { runSessionClosingAssist, saveDpepAction } = vi.hoisted(() => ({
  runSessionClosingAssist: vi.fn(),
  saveDpepAction: vi.fn(),
}));

vi.mock("@/features/sessions/ai/actions", () => ({
  runSessionClosingAssist,
}));

vi.mock("@/features/sessions/actions", () => ({
  saveDpepAction,
}));

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function renderForm() {
  const onSaved = vi.fn();
  render(
    <DpepForm
      sessionId={SESSION_ID}
      dpep={null}
      version={1}
      onSaved={onSaved}
    />,
  );
  return { onSaved };
}

describe("DpepForm — geração local de rascunho", () => {
  beforeEach(() => {
    runSessionClosingAssist.mockReset();
    saveDpepAction.mockReset();
    saveDpepAction.mockResolvedValue({});
  });

  it("preenche os quatro campos com DPEP válido e não salva sozinho", async () => {
    const user = userEvent.setup();
    runSessionClosingAssist.mockResolvedValue({
      artifactId: "22222222-2222-4222-8222-222222222222",
      content: {
        dpepDraft: {
          demanda: "Demanda gerada",
          procedimentos: "Procedimento gerado",
          evolucao: "Evolução gerada",
          plano: "Plano gerado",
        },
      },
    });
    const { onSaved } = renderForm();

    await user.click(screen.getByRole("button", { name: "Gerar rascunho com IA" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Demanda")).toHaveValue("Demanda gerada");
    });
    expect(screen.getByLabelText("Procedimentos")).toHaveValue("Procedimento gerado");
    expect(screen.getByLabelText("Evolução")).toHaveValue("Evolução gerada");
    expect(screen.getByLabelText("Plano / Encaminhamentos")).toHaveValue("Plano gerado");
    expect(screen.getByText(SESSION_AI_DRAFT_BANNER)).toBeInTheDocument();
    expect(saveDpepAction).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("mostra erro local e preserva campos já digitados", async () => {
    const user = userEvent.setup();
    runSessionClosingAssist.mockResolvedValue({
      error: SESSION_AI_USER_ERROR,
      correlationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    });
    renderForm();

    await user.type(screen.getByLabelText("Demanda"), "Texto manual");
    await user.click(screen.getByRole("button", { name: "Gerar rascunho com IA" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SESSION_AI_USER_ERROR);
    });
    expect(screen.getByLabelText("Demanda")).toHaveValue("Texto manual");
    expect(screen.getByText("Código: AAAAAAAA")).toBeInTheDocument();
    expect(screen.queryByText(/ENV_ERROR|HTTP 403|Gemini|Zod|RLS/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar esta página")).not.toBeInTheDocument();
  });

  it("não chama a IA duas vezes no clique duplo", async () => {
    const user = userEvent.setup();
    let resolveAssist: (value: unknown) => void = () => undefined;
    runSessionClosingAssist.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAssist = resolve;
        }),
    );
    renderForm();

    const button = screen.getByRole("button", { name: "Gerar rascunho com IA" });
    await user.click(button);
    expect(button).toBeDisabled();
    expect(runSessionClosingAssist).toHaveBeenCalledTimes(1);

    resolveAssist({
      content: {
        dpepDraft: { demanda: "ok", procedimentos: "", evolucao: "", plano: "" },
      },
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Demanda")).toHaveValue("ok");
    });
  });

  it("pede confirmação antes de substituir conteúdo existente", async () => {
    const user = userEvent.setup();
    runSessionClosingAssist.mockResolvedValue({
      content: {
        dpepDraft: {
          demanda: "Novo rascunho",
          procedimentos: "",
          evolucao: "",
          plano: "",
        },
      },
    });
    renderForm();

    await user.type(screen.getByLabelText("Demanda"), "Já escrito");
    await user.click(screen.getByRole("button", { name: "Gerar rascunho com IA" }));

    await waitFor(() => {
      expect(screen.getByText("Já existe conteúdo neste DPEP")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Demanda")).toHaveValue("Já escrito");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Demanda")).toHaveValue("Já escrito");

    await user.click(screen.getByRole("button", { name: "Gerar rascunho com IA" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Substituir pelo rascunho" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Substituir pelo rascunho" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Demanda")).toHaveValue("Novo rascunho");
    });
  });

  it("mostra mensagem de contexto vazio sem apagar o formulário", async () => {
    const user = userEvent.setup();
    runSessionClosingAssist.mockResolvedValue({ error: SESSION_AI_EMPTY_CONTEXT_MESSAGE });
    renderForm();

    await user.click(screen.getByRole("button", { name: "Gerar rascunho com IA" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SESSION_AI_EMPTY_CONTEXT_MESSAGE);
    });
    expect(screen.getByLabelText("Demanda")).toHaveValue("");
  });

  it("captura exceção da action sem derrubar o formulário", async () => {
    const user = userEvent.setup();
    runSessionClosingAssist.mockRejectedValue(new Error("boom"));
    renderForm();

    await user.type(screen.getByLabelText("Evolução"), "permanece");
    await user.click(screen.getByRole("button", { name: "Gerar rascunho com IA" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SESSION_AI_USER_ERROR);
    });
    expect(screen.getByLabelText("Evolução")).toHaveValue("permanece");
  });
});
