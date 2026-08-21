import { expect, test } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

test.describe("Conhecimento Tesseli", () => {
  test("secretária vê acesso restrito em /app/knowledge", async ({ page }) => {
    await loginViaUi(page);
    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);

    await page.goto("/app/knowledge");
    await expect(page).toHaveURL(/\/app\/knowledge$/);
    await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
    await expect(
      page.getByText(/Você não tem permissão para abrir o Conhecimento clínico/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar ao Meu Dia" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Conhecimento Tesseli" })).toHaveCount(0);
  });

  test("admin vê coleções, fontes e os cinco modos", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/knowledge");

    await expect(page.getByRole("heading", { name: "Conhecimento Tesseli" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Perguntar ao Acervo" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Síntese Temática" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Comparar Fontes" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Modo Estudo" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Aplicar ao Caso" })).toBeVisible();
  });

  test("cria uma coleção", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/knowledge");

    await page.getByPlaceholder("Nova coleção").fill("TCC — Fundamentos E2E");
    await page.getByRole("button", { name: "Criar coleção" }).click();
    await expect(page.getByText("TCC — Fundamentos E2E")).toBeVisible();
  });

  test("envia uma fonte de texto e ela aparece na lista com algum status", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/knowledge");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Enviar fonte" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "nota-e2e.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Este é um texto de exemplo sobre terapia cognitivo-comportamental para os testes E2E.",
      ),
    });

    await expect(page.getByText("nota-e2e")).toBeVisible({ timeout: 15000 });
  });

  test("Aplicar ao Caso é negado pelo gate de consentimento sem tocar a IA real", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/knowledge");

    await page.getByRole("tab", { name: "Aplicar ao Caso" }).click();
    await page.locator("select").first().selectOption({ index: 1 });
    await page
      .getByPlaceholder("Pergunta clínica para aplicar a literatura ao caso…")
      .fill("Como aplicar isso ao caso?");
    await page.getByRole("button", { name: "Consultar" }).click();

    await expect(
      page.getByText("Consentimento de apoio de IA não está válido para este paciente."),
    ).toBeVisible();
  });
});
