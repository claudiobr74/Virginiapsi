import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS_BADGE_STATUSES, StatusBadge } from "@/components/ui/status-badge";

describe("StatusBadge", () => {
  it("renderiza um rótulo para cada status canônico", () => {
    for (const status of STATUS_BADGE_STATUSES) {
      render(<StatusBadge status={status} label={status} />);
    }
    for (const status of STATUS_BADGE_STATUSES) {
      expect(screen.getAllByText(status).length).toBeGreaterThan(0);
    }
  });

  it("mostra o indicador pulsante somente quando active + pulse", () => {
    const { container, rerender } = render(
      <StatusBadge status="active" label="Ativo" pulse />,
    );
    expect(container.querySelector(".animate-ping")).not.toBeNull();

    rerender(<StatusBadge status="active" label="Ativo" />);
    expect(container.querySelector(".animate-ping")).toBeNull();
  });
});
