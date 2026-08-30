import { expect, test } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

test.describe("Hardening de acessibilidade e headers", () => {
  test("skip-link leva ao landmark principal autenticado", async ({ page }) => {
    await loginViaUi(page);

    const skip = page.getByRole("link", { name: "Ir para o conteúdo principal" });
    await skip.focus();
    await expect(skip).toBeVisible();
    await skip.click();
    await expect(page).toHaveURL(/#conteudo-principal/);
    await expect(page.getByRole("main")).toHaveAttribute("id", "conteudo-principal");
  });

  test("respostas públicas enviam headers de segurança", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response).not.toBeNull();
    const headers = response?.headers() ?? {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["permissions-policy"]).toContain("microphone=(self)");
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["content-security-policy"]).not.toMatch(/script-src\s+\*/);
    expect(headers["content-security-policy"]).toMatch(/script-src[^;]*'nonce-/);
    expect(headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
  });
});
