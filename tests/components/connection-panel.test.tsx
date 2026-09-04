import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionPanel } from "@/features/calendar/components/connection-panel";
import type { ConnectionRow } from "@/features/calendar/contracts";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/agenda",
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/calendar/connection-actions", () => ({
  disconnectGoogleAction: vi.fn(),
  listCalendarsAction: vi.fn(),
  selectCalendarAction: vi.fn(),
  startGoogleConnectionAction: vi.fn(),
}));

vi.mock("@/features/calendar/sync-actions", () => ({
  syncGoogleCalendarAction: vi.fn(),
}));

const disconnectedWithStaleMetadata: ConnectionRow = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  status: "disconnected",
  google_account_email: "virginiamacedorecriar@gmail.com",
  calendar_id: "primary",
  calendar_summary: "Agenda antiga",
  scopes: ["https://www.googleapis.com/auth/calendar"],
  last_synced_at: "2026-08-21T15:00:00.000Z",
  last_sync_error: "token revogado",
  cancelled_google_color_ids: [],
  unavailable_google_color_ids: [],
};

describe("ConnectionPanel — desconectado", () => {
  it("mostra só o estado simples, sem conta/sync/callback antigos", () => {
    render(
      <ConnectionPanel connection={disconnectedWithStaleMetadata} canManage />,
    );

    expect(screen.getByRole("heading", { name: "Google Agenda" })).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Não conectado")).toBeInTheDocument();
    expect(
      screen.getByText("Conecte uma conta Google para sincronizar seus compromissos."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Conectar Google Agenda" }),
    ).toBeInTheDocument();

    expect(screen.queryByText("virginiamacedorecriar@gmail.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/última sincronização/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/21\/08\/2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cadastre este endereço/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/callback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tesseli/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GOOGLE_OAUTH/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vercel\.app/i)).not.toBeInTheDocument();
  });
});
