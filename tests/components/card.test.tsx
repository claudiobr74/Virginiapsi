import { render, screen } from "@testing-library/react";
import { ClipboardCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/card";
import { SURFACE_TONES } from "@/lib/ui/surface-tone";

describe("Card tonal", () => {
  it("expõe as famílias Clinical Pastel", () => {
    expect(SURFACE_TONES).toEqual([
      "neutral",
      "agenda",
      "clinical",
      "finance",
      "tasks",
      "documents",
      "knowledge",
      "settings",
    ]);
  });

  it("usa tokens de superfície, não hex espalhado", () => {
    const { container } = render(
      <Card tone="clinical" icon={<ClipboardCheck />} title="Sessões a Finalizar">
        <p>3 sessões</p>
      </Card>,
    );
    expect(container.querySelector(".bg-tone-clinical")).toBeTruthy();
    expect(container.querySelector(".border-tone-clinical-border")).toBeTruthy();
    expect(container.querySelector(".text-tone-clinical-icon")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/bg-\[#/);
    expect(screen.getByRole("heading", { name: "Sessões a Finalizar" })).toBeInTheDocument();
  });

  it("headed mantém o corpo neutro", () => {
    const { container } = render(
      <Card headed tone="finance" title="Pendências Financeiras">
        <p>conteúdo</p>
      </Card>,
    );
    expect(container.querySelector(".bg-tone-finance")).toBeTruthy();
    expect(container.querySelector(".bg-card")).toBeTruthy();
  });
});
