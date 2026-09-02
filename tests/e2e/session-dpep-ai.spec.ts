import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, productAlert } from "./support/fixtures";

async function openPatientAndStartSession(page: Page, preferredName: string) {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);

  const tcle = page.getByRole("tab", { name: "TCLE" });
  if (await tcle.isVisible().catch(() => false)) {
    await tcle.click();
    const register = page.getByRole("button", { name: "Registrar Apoio de IA" });
    if ((await register.count()) > 0) {
      await register.click();
    }
  }

  await page.getByRole("button", { name: "Iniciar sessão" }).click();
  await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);
}

test.describe("DPEP com IA — isolamento da sessão", () => {
  test("sem contexto: mensagem local e preenchimento manual continua", async ({ page }) => {
    await loginViaUi(page);
    await openPatientAndStartSession(page, "Sessão Um");

    await page.getByRole("button", { name: "Gerar rascunho com IA" }).click();
    await expect(
      productAlert(page, /conteúdo suficiente|Consentimento de apoio de IA|Não foi possível gerar/),
    ).toBeVisible();
    await expect(page.getByText("Não foi possível carregar esta página")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "DPEP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcrição em tempo real" })).toBeVisible();

    await page.getByLabel("Demanda").fill("Preenchimento manual após recusa da IA");
    await page.getByRole("button", { name: "Salvar DPEP" }).click();
    await expect(page.getByText("DPEP salvo.")).toBeVisible();
  });

  test("falha da IA não derruba a sessão nem apaga o DPEP digitado", async ({ page }) => {
    await loginViaUi(page);
    await openPatientAndStartSession(page, "Sessão Quatro");

    await page.getByLabel("Demanda").fill("Texto que deve permanecer se a IA falhar");
    await page.getByRole("button", { name: "Gerar rascunho com IA" }).click();

    await expect(page.getByText("Não foi possível carregar esta página")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "DPEP" })).toBeVisible();
    await expect(page.getByLabel("Demanda")).toHaveValue("Texto que deve permanecer se a IA falhar");
    await expect(page.getByText(/Em andamento|Finalizada/)).toBeVisible();
  });

  test("já existe DPEP digitado: conteúdo permanece após gerar", async ({ page }) => {
    await loginViaUi(page);
    await openPatientAndStartSession(page, "Sessão Dois");

    await page.getByLabel("Demanda").fill("Conteúdo pré-existente");
    await page.getByRole("button", { name: "Gerar rascunho com IA" }).click();

    await expect(page.getByLabel("Demanda")).toHaveValue("Conteúdo pré-existente");
    await expect(page.getByText("Não foi possível carregar esta página")).toHaveCount(0);
  });

  test("mobile: DPEP e botão de IA cabem na viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "viewport móvel dedicado");
    await loginViaUi(page);
    await openPatientAndStartSession(page, "Sessão Tres");

    await expect(page.getByRole("heading", { name: "DPEP" })).toBeVisible();
    const generate = page.getByRole("button", { name: "Gerar rascunho com IA" });
    await expect(generate).toBeVisible();
    const box = await generate.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(430);
    const demanda = page.getByLabel("Demanda");
    const demandaBox = await demanda.boundingBox();
    expect(demandaBox).toBeTruthy();
    expect(demandaBox!.x + demandaBox!.width).toBeLessThanOrEqual(430);
  });
});
