import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOGO_INTRINSIC_HEIGHT, LOGO_INTRINSIC_WIDTH, LOGO_SRC, Logo } from "@/components/ui/logo";

describe("Logo oficial", () => {
  it("aponta para o PNG oficial com as dimensões intrínsecas do arquivo", () => {
    expect(LOGO_SRC).toBe("/brand/virginia-psi-mark.png");
    expect(LOGO_INTRINSIC_WIDTH).toBe(1536);
    expect(LOGO_INTRINSIC_HEIGHT).toBe(1024);
  });

  it("renderiza só a imagem, sem wordmark extra em texto", () => {
    render(<Logo width={200} />);
    const image = screen.getByRole("img", { name: "VirgíniaPsi" });
    expect(image).toBeInTheDocument();
    expect(image.getAttribute("src") ?? "").toContain("virginia-psi-mark");
    expect(screen.queryByText("Virgínia")).not.toBeInTheDocument();
    expect(screen.queryByText("Psi")).not.toBeInTheDocument();
  });

  it("o arquivo em public/brand permanece o lockup enviado", () => {
    const digest = createHash("sha256")
      .update(readFileSync(path.join(process.cwd(), "public/brand/virginia-psi-mark.png")))
      .digest("hex");
    expect(digest).toBe(
      "d23c0e4095b37c4cd7c6cc2695fbc376bd13ace939c7b5e75d651c6dc1575184",
    );
  });

  it("neutraliza o fundo opaco só no wrapper da marca", () => {
    const { container } = render(<Logo width={200} />);
    expect(container.querySelector(".brand-surface")).toBeTruthy();
    expect(container.querySelector(".brand-mark")).toBeTruthy();
  });
});
