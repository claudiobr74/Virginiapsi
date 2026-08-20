import { expect, test } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

test.describe("Meu Dia — dashboard operacional", () => {
  test("saudação, timeline do dia e estados vazios das fases futuras", async ({
    page,
  }) => {
    await loginViaUi(page);

    await expect(page.getByRole("heading", { name: "Meu Dia" })).toBeVisible();
    await expect(page.getByText("Olá, Ana Serena")).toBeVisible();
    await expect(
      page.getByText("Um dia de cada vez — presença e cuidado na rotina clínica."),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Linha do tempo de hoje" }),
    ).toBeVisible();
    await expect(page.getByText("Beatriz • PAC-001").first()).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Sessões a finalizar" }),
    ).toBeVisible();
    await expect(
      page.getByText("Sessões a finalizar chegam na Fase 6"),
    ).toBeVisible();
    await expect(
      page.getByText("Pendências financeiras chegam na Fase 10"),
    ).toBeVisible();
    await expect(
      page.getByText("Documentos recentes chegam na Fase 9"),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Lembrete WhatsApp" }).first(),
    ).toHaveAttribute("href", /https:\/\/wa\.me\/5511988887777/);
  });

  test("cria e conclui uma tarefa operacional", async ({ page }) => {
    await loginViaUi(page);

    const title = `Ligar para o laboratório ${Date.now()}`;
    await page.getByLabel("Título da nova tarefa").fill(title);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("button", { name: `Concluir ${title}` }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("confirma a consulta gerenciada a partir da timeline", async ({ page }) => {
    await loginViaUi(page);

    const row = page.getByRole("listitem").filter({ hasText: "Beatriz • PAC-001" });
    await expect(row).toBeVisible();
    const confirmButton = row.getByRole("button", { name: "Confirmar" });
    if ((await confirmButton.count()) > 0) {
      await confirmButton.click();
    }
    await expect(row.getByText("Confirmada")).toBeVisible();
  });
});
