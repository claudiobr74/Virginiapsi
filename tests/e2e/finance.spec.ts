import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

async function openFinance(page: Page) {
  await page.goto("/app/finance");
  await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
}

test.describe("Financeiro", () => {
  test.describe.configure({ mode: "serial" });
  test("admin lança cobrança, registra pagamento parcial e emite recibo", async ({ page }) => {
    await loginViaUi(page);
    await openFinance(page);

    await page.getByRole("tab", { name: "Recebimentos" }).click();
    const description = `Sessão avulsa E2E ${Date.now()}`;
    await page.getByPlaceholder("Sessão avulsa, pacote…").fill(description);
    await page.getByPlaceholder("150,00").fill("150,00");
    await page.getByRole("button", { name: "Lançar cobrança" }).click();
    await expect(page.getByText(description)).toBeVisible();

    const card = page.locator("li").filter({ hasText: description });
    await card.getByLabel(/Baixa rápida/).fill("50,00");
    await card.getByRole("button", { name: "Registrar pagamento" }).click();
    await expect(card.getByText("Parcial")).toBeVisible();
    await expect(card.getByText(/Saldo/)).toBeVisible();

    await card.getByRole("button", { name: "Recibo" }).click();
    await expect(page.getByText(description)).toBeVisible();
  });

  test("admin lança despesa, marca paga e exporta CSV", async ({ page }) => {
    await loginViaUi(page);
    await openFinance(page);

    await page.getByRole("tab", { name: "Despesas" }).click();
    const description = `Aluguel E2E ${Date.now()}`;
    await page.getByPlaceholder("Aluguel, material…").fill("Infraestrutura");
    await page.locator('input[name="description"]').fill(description);
    await page.getByPlaceholder("200,00").fill("200,00");
    await page.getByRole("button", { name: "Lançar despesa" }).click();
    await expect(page.getByText(description)).toBeVisible();

    const row = page.locator("li").filter({ hasText: description });
    await row.getByRole("button", { name: "Marcar paga" }).click();
    await expect(row.getByText("Paga", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Relatórios" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/tesseli-financeiro-/);
  });

  test("admin fecha o período mensal", async ({ page }) => {
    await loginViaUi(page);
    await openFinance(page);
    await page.getByRole("tab", { name: "Relatórios" }).click();
    await page.getByRole("button", { name: "Fechar período" }).click();
    await expect(page.getByText(/fechado/)).toBeVisible();
  });

  test("secretária sem acesso vê a tela de bloqueio", async ({ page }) => {
    await loginViaUi(page);
    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);
    await page.goto("/app/finance");
    await expect(page.getByText("Sem acesso ao financeiro")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Recebimentos" })).toHaveCount(0);
  });

  test("admin libera manage e a secretária passa a lançar cobrança", async ({ page }) => {
    await loginViaUi(page);
    await openFinance(page);
    await page.getByLabel("Permissão financeira").selectOption("manage");
    await page.getByRole("button", { name: "Salvar acesso" }).click();
    await expect(page.getByText("Acesso atualizado.")).toBeVisible();

    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);
    await page.goto("/app/finance");
    await expect(page.getByRole("tab", { name: "Recebimentos" })).toBeVisible();
    await page.getByRole("tab", { name: "Recebimentos" }).click();

    const description = `Cobrança secretaria ${Date.now()}`;
    await page.getByPlaceholder("Sessão avulsa, pacote…").fill(description);
    await page.getByPlaceholder("150,00").fill("80,00");
    await page.getByRole("button", { name: "Lançar cobrança" }).click();
    await expect(page.getByText(description)).toBeVisible();
  });

  test("finalizar sessão gera cobrança idempotente no financeiro", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/patients");
    await page.getByText("Financeiro Sessão", { exact: true }).click();
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Iniciar sessão" }).click();
    await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Finalizar atendimento" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apenas finalizar" }).click();
    await page.waitForURL(/\/app\/patients$/);

    await openFinance(page);
    await page.getByRole("tab", { name: "Recebimentos" }).click();
    await expect(page.getByText("Sessão clínica").first()).toBeVisible();
    await expect(page.getByText("R$ 150,00").first()).toBeVisible();
  });
});
