import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionMeetAction } from "@/features/sessions/components/session-meet-action";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("SessionMeetAction", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("oferece criação para qualquer sessão ativa sem depender de modalidade ou agendamento", () => {
    render(
      <SessionMeetAction
        sessionId="00000000-0000-4000-8000-000000000001"
        meetUrl={null}
        status={null}
        canCreate
        requestMeetAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Criar Google Meet" })).toBeInTheDocument();
  });

  it("cria pelo sessionId, abre exatamente a URL retornada e atualiza a sessão", async () => {
    const sessionId = "00000000-0000-4000-8000-000000000002";
    const requestMeetAction = vi.fn().mockResolvedValue({
      status: "ready",
      meetUrl: "https://meet.google.com/session-room",
      autoTranscriptionEnabled: true,
    });
    const popup = {
      opener: {},
      location: { href: "about:blank" },
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(
      <SessionMeetAction
        sessionId={sessionId}
        meetUrl={null}
        status={null}
        canCreate
        requestMeetAction={requestMeetAction}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Criar Google Meet" }));

    await waitFor(() => {
      expect(requestMeetAction).toHaveBeenCalledTimes(1);
      expect(requestMeetAction).toHaveBeenCalledWith(sessionId);
      expect(popup.location.href).toBe("https://meet.google.com/session-room");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("reutiliza a URL persistida e permite copiá-la", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <SessionMeetAction
        sessionId="00000000-0000-4000-8000-000000000003"
        meetUrl="https://meet.google.com/already-bound"
        status="ready"
        canCreate
      />,
    );

    const openLink = screen.getByRole("link", {
      name: "Abrir Google Meet desta sessão em uma nova aba",
    });
    expect(openLink).toHaveAttribute("href", "https://meet.google.com/already-bound");
    expect(openLink).toHaveAttribute("target", "_blank");

    await userEvent.click(
      screen.getByRole("button", { name: "Copiar link do Google Meet desta sessão" }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://meet.google.com/already-bound");
      expect(screen.getByText("Copiado")).toBeInTheDocument();
    });
  });

  it("não cria nova sala em sessão encerrada sem vínculo", () => {
    render(
      <SessionMeetAction
        sessionId="00000000-0000-4000-8000-000000000004"
        meetUrl={null}
        status={null}
        canCreate={false}
        requestMeetAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Criar Google Meet" })).not.toBeInTheDocument();
  });

  it("oferece nova tentativa após falha de criação", () => {
    render(
      <SessionMeetAction
        sessionId="00000000-0000-4000-8000-000000000005"
        meetUrl={null}
        status="failed"
        canCreate
        requestMeetAction={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Tentar criar Google Meet" }),
    ).toBeInTheDocument();
  });
});
