import { render, screen } from "@testing-library/react";
import { ClipboardCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";

describe("DashboardWidget", () => {
  it("aceita tone e ícone sem mudar o heading", () => {
    render(
      <DashboardWidget
        id="sessions-to-finalize-heading"
        title="Sessões a Finalizar"
        tone="clinical"
        icon={<ClipboardCheck />}
      >
        <p>3 sessões</p>
      </DashboardWidget>,
    );
    const heading = screen.getByRole("heading", { name: "Sessões a Finalizar" });
    expect(heading).toHaveAttribute("id", "sessions-to-finalize-heading");
    expect(heading.closest(".bg-tone-clinical")).toBeTruthy();
  });
});
