import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SessionAiPanel } from "@/features/sessions/components/session-ai-panel";
import { SESSION_AI_LIVE_USER_ERROR } from "@/features/sessions/ai/messages";

const { runSessionLiveAssist } = vi.hoisted(() => ({
  runSessionLiveAssist: vi.fn(),
}));

vi.mock("@/features/sessions/ai/actions", () => ({
  runSessionLiveAssist,
}));

describe("SessionAiPanel — erro local", () => {
  beforeEach(() => {
    runSessionLiveAssist.mockReset();
  });

  it("não quebra quando o conteúdo estruturado vem incompleto", async () => {
    const user = userEvent.setup();
    runSessionLiveAssist.mockResolvedValue({
      content: { summarySoFar: "faltando safety" },
    });
    render(<SessionAiPanel sessionId="11111111-1111-4111-8111-111111111111" />);

    await user.click(screen.getByRole("button", { name: "Apoio ao vivo" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SESSION_AI_LIVE_USER_ERROR);
    });
    expect(screen.queryByText("Não foi possível carregar esta página")).not.toBeInTheDocument();
  });
});
