import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOGO_INTRINSIC_HEIGHT, LOGO_INTRINSIC_WIDTH, LOGO_SRC, Logo } from "@/components/ui/logo";

const ORIGINAL_SHA256 =
  "d23c0e4095b37c4cd7c6cc2695fbc376bd13ace939c7b5e75d651c6dc1575184";
const TRANSPARENT_SHA256 =
  "3b8d9aecd915bb63331466686b5c9e5703a5b971ae2b740a129ac153551ec20f";

function sha256Of(relative: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), relative)))
    .digest("hex");
}

function pngIhdr(relative: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(path.join(process.cwd(), relative));
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25] ?? -1,
  };
}

describe("Logo oficial", () => {
  it("aponta para o PNG transparente com as dimensões intrínsecas do arquivo", () => {
    expect(LOGO_SRC).toBe("/brand/virginia-psi-lockup-transparent.png");
    expect(LOGO_INTRINSIC_WIDTH).toBe(1536);
    expect(LOGO_INTRINSIC_HEIGHT).toBe(1024);
  });

  it("renderiza só a imagem, sem wordmark extra em texto", () => {
    render(<Logo width={200} />);
    const image = screen.getByRole("img", { name: "VirgíniaPsi" });
    expect(image).toBeInTheDocument();
    expect(image.getAttribute("src") ?? "").toContain("virginia-psi-lockup-transparent");
    expect(screen.queryByText("Virgínia")).not.toBeInTheDocument();
    expect(screen.queryByText("Psi")).not.toBeInTheDocument();
  });

  it("arquiva o lockup original byte-identical e usa o asset RGBA só para exibição", () => {
    expect(sha256Of("public/brand/virginia-psi-mark.png")).toBe(ORIGINAL_SHA256);
    expect(sha256Of("public/brand/source/virginia-psi-lockup-original.png")).toBe(
      ORIGINAL_SHA256,
    );
    expect(sha256Of("public/brand/virginia-psi-lockup-transparent.png")).toBe(
      TRANSPARENT_SHA256,
    );

    const original = pngIhdr("public/brand/source/virginia-psi-lockup-original.png");
    const display = pngIhdr("public/brand/virginia-psi-lockup-transparent.png");
    expect(display.width).toBe(original.width);
    expect(display.height).toBe(original.height);
    expect(display.width).toBe(LOGO_INTRINSIC_WIDTH);
    expect(display.height).toBe(LOGO_INTRINSIC_HEIGHT);
    expect(display.colorType).toBe(6);
  });

  it("o wrapper da marca é só layout, sem blend nem placa cream", () => {
    const { container } = render(<Logo width={200} />);
    expect(container.querySelector(".brand-surface")).toBeTruthy();
    expect(container.querySelector(".brand-mark")).toBeTruthy();

    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).not.toContain("mix-blend-mode: multiply");
    expect(css).not.toContain(".dark .brand-surface");
  });
});
