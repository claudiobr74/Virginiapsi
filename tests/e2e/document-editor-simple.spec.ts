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

test.describe("Editor simplificado", () => {
  test("foco no documento, Ajustes, IA e finalização sob demanda", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents/new?template=declaration_attendance");
    await page.getByLabel(/Paciente/).selectOption({ label: "Documentos Dois — Documentos Dois Paciente" });
    await page.getByPlaceholder("Para que este documento será usado?").fill("comprovação de comparecimento");
    await page.getByRole("button", { name: "Criar documento" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("button", { name: "Ajustes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ajustes do documento" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Modo foco" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajudar a escrever" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revisar e finalizar" })).toBeVisible();

    await shot(page, "editor-default");

    await page.getByRole("button", { name: "Ajustes" }).click();
    await expect(page.getByRole("heading", { name: "Ajustes do documento" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dados" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aparência" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Texto" })).toBeVisible();
    await shot(page, "editor-ajustes");
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.getByRole("button", { name: "Ajudar a escrever" }).click();
    await expect(page.getByText("O que você gostaria de fazer?")).toBeVisible();
    await shot(page, "editor-ia");
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.getByRole("button", { name: "Revisar e finalizar" }).click();
    await expect(page.getByRole("heading", { name: "Antes de finalizar" })).toBeVisible();
    await shot(page, "editor-finalizar");
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.getByRole("button", { name: "Mais", exact: true }).and(page.locator('[aria-label="Mais"]')).click();
    await expect(page.getByRole("button", { name: "Histórico de versões" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar documento" })).toBeVisible();
  });
});
