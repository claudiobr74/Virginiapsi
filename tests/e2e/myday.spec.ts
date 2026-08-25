import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

async function openPatient(page: Page, preferredName: string): Promise<string> {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

async function startSession(page: Page, patientId: string): Promise<string> {
  await page.goto(`/app/patients/${patientId}`);
  await page.getByRole("button", { name: "Iniciar sessão" }).click();
  await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

test.describe("Meu Dia — dashboard operacional", () => {
  test("saudação, timeline do dia e widgets operacionais", async ({ page }) => {
    await loginViaUi(page);

    await expect(page.getByRole("heading", { name: /Ana Serena/ })).toBeVisible();
    await expect(page.getByText("Olá, Ana Serena")).toBeVisible();
    await expect(
      page.getByText("Um dia de cada vez — presença e cuidado na rotina clínica."),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Agenda de Hoje" }),
    ).toBeVisible();
    await expect(page.getByText("Beatriz • PAC-001").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Atendimento Avulso" })).toBeVisible();
    await expect(page.getByText("Sessões esta semana")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Sessões a Finalizar" }),
    ).toBeVisible();
    await expect(page.getByText("Sessões a finalizar chegam na Fase 6")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pendências Financeiras" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Abrir financeiro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Documentos Gerados" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver todos" })).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Lembrete WhatsApp" }).first(),
    ).toHaveAttribute("href", /https:\/\/wa\.me\/5511988887777/);
  });

  test("lista sessão em andamento com atalho para o DPEP", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Meu Dia Sessão");
    const sessionId = await startSession(page, patientId);

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Sessões a finalizar" })).toBeVisible();
    const link = page.getByRole("link", { name: /Meu Dia Sessão/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `/session/${sessionId}`);
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
