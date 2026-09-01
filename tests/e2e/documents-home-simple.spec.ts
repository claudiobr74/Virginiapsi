import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

const SHOT_DIR = path.join(process.cwd(), "artifacts/document-studio-ux");

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const viewport = page.viewportSize();
  const suffix = viewport ? `${viewport.width}x${viewport.height}` : "unknown";
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}-${suffix}.png`),
    fullPage: true,
  });
}

test.describe("Documentos home simplificada", () => {
  test("atalhos, busca e catálogo sob demanda", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents");
    await expect(page.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "O que você quer criar?" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Declaração/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Relatório/ })).toBeVisible();
    await expect(page.getByPlaceholder("Buscar um modelo...")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Declarações" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Administrativos" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Termos e autorizações" })).toHaveCount(0);
    await shot(page, "home");

    await page.getByPlaceholder("Buscar um modelo...").fill("psiquiatra");
    await expect(page.getByRole("link", { name: /Relatório para psiquiatra/ })).toBeVisible();

    await page.getByRole("button", { name: "Ver todos os modelos" }).click();
    await expect(page.getByRole("heading", { name: "Todos os modelos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Declarações" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Usar modelo" }).first()).toBeVisible();
    await shot(page, "catalogo");
    await page.getByRole("button", { name: "Fechar" }).click();

    await expect(page.getByRole("link", { name: "Gerenciar modelos" })).toBeVisible();
  });

  test("home em 768x1024", async ({ page }) => {
    await loginViaUi(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/app/documents");
    await expect(page.getByRole("heading", { name: "O que você quer criar?" })).toBeVisible();
    await shot(page, "home");
    await page.goto("/app/documents/new");
    await expect(page.getByRole("heading", { name: "Que documento você quer criar?" })).toBeVisible();
    await shot(page, "novo-documento");
  });
});
