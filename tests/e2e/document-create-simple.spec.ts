import { expect, test } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

test.describe("Novo documento simplificado", () => {
  test("template na URL não pede o modelo de novo", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents/new?template=declaration_attendance");
    await expect(page.getByRole("heading", { name: "Declaração de comparecimento" })).toBeVisible();
    await expect(page.getByText("modelo selecionado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trocar modelo" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Modelo" })).toHaveCount(0);
    await expect(page.getByLabel(/Paciente/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar documento" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar estrutura" })).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/document-studio-ux/novo-documento-${page.viewportSize()?.width}x${page.viewportSize()?.height}.png`,
      fullPage: true,
    });
  });

  test("categoria com vários modelos abre o picker", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents");
    await page.getByRole("link", { name: /Relatório Comunicação/ }).click();
    await expect(page).toHaveURL(/category=relatorios/);
    await expect(page.getByRole("heading", { name: "Que documento você quer criar?" })).toBeVisible();
    await page.getByRole("button", { name: /Relatório psicológico completo/ }).click();
    await expect(page.getByText("modelo selecionado")).toBeVisible();
    await expect(page.getByLabel(/Paciente/)).toBeVisible();
  });
});
