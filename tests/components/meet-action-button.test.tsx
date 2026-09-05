import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MeetActionButton } from "@/features/calendar/components/meet-action-button";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("MeetActionButton", () => {
  it("não exibe controle para atendimento presencial", () => {
    render(
      <MeetActionButton
        appointmentId="apt-1"
        modality="in_person"
        origin="TESSELI"
        meetUrl={null}
        meetStatus="none"
        requestMeetAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("abre exatamente a URL real persistida quando o Meet está pronto", () => {
    render(
      <MeetActionButton
        appointmentId="apt-2"
        modality="online"
        origin="TESSELI"
        meetUrl="https://meet.google.com/real-room"
        meetStatus="success"
      />,
    );

    const link = screen.getByRole("link", { name: "Abrir Google Meet em uma nova aba" });
    expect(link).toHaveAttribute("href", "https://meet.google.com/real-room");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("permite criar/recuperar Meet em atendimento online gerenciado", async () => {
    const requestMeetAction = vi.fn().mockResolvedValue({});

    render(
      <MeetActionButton
        appointmentId="apt-3"
        modality="online"
        origin="TESSELI"
        meetUrl={null}
        meetStatus="none"
        requestMeetAction={requestMeetAction}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Criar Google Meet" }));

    await waitFor(() => {
      expect(requestMeetAction).toHaveBeenCalledTimes(1);
      expect(requestMeetAction).toHaveBeenCalledWith("apt-3");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("não oferece criação para evento Google externo sem link", () => {
    render(
      <MeetActionButton
        appointmentId="apt-4"
        modality="online"
        origin="GOOGLE_EXTERNAL"
        meetUrl={null}
        meetStatus="none"
        requestMeetAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
