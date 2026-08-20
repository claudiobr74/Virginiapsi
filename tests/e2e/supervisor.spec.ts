import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

async function openPatient(page: Page, preferredName: string): Promise<string> {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

async function createFinalizedSession(page: Page, patientId: string): Promise<void> {
  await page.goto(`/app/patients/${patientId}`);
  await page.getByRole("button", { name: "Iniciar sessão" }).click();
  await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);

  await page.getByLabel("Demanda").fill("Ansiedade relacionada ao trabalho");
  await page.getByRole("button", { name: "Salvar DPEP" }).click();
  await expect(page.getByText("DPEP salvo.")).toBeVisible();

  await page.getByRole("button", { name: "Finalizar atendimento" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apenas finalizar" }).click();
  await page.waitForURL(/\/app\/patients$/);
}

test.describe("Supervisor Clínico IA", () => {
  test("sem patientId, mostra o seletor de paciente", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/supervisor");
    await expect(page.getByText("Selecione um paciente para iniciar")).toBeVisible();
  });

  test("com patientId, mostra a configuração com a sessão finalizada disponível", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Supervisor Um");
    await createFinalizedSession(page, patientId);

    await page.goto(`/app/supervisor?patientId=${patientId}`);
    await expect(page.getByRole("heading", { name: "Configuração" })).toBeVisible();
    await expect(page.getByLabel("Objetivo da supervisão")).toBeVisible();
    await expect(page.getByLabel("Pergunta clínica")).toBeVisible();
    await expect(page.getByText("TCC", { exact: true })).toBeVisible();
    // A sessão recém-finalizada aparece como opção selecionável.
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible();
  });

  test("é possível ver os dados que seriam enviados à IA antes de consultar", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Supervisor Dois");
    await createFinalizedSession(page, patientId);

    await page.goto(`/app/supervisor?patientId=${patientId}`);
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByLabel("Objetivo da supervisão").fill("Preparar próxima sessão");
    await page.getByLabel("Pergunta clínica").fill("Como conduzir o próximo encontro?");

    await page.getByRole("button", { name: "Ver dados enviados à IA" }).click();
    const preview = page.locator("pre");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Preparar próxima sessão");
    await expect(preview).toContainText("Como conduzir o próximo encontro?");
  });

  test("sem consentimento de apoio de IA, a consulta é negada pelo gate (nenhuma chamada à IA acontece)", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Supervisor Tres");
    await createFinalizedSession(page, patientId);

    await page.goto(`/app/supervisor?patientId=${patientId}`);
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByLabel("Objetivo da supervisão").fill("Dúvida clínica");
    await page.getByLabel("Pergunta clínica").fill("Como interpretar esse padrão?");

    await page.getByRole("button", { name: "Consultar Supervisor" }).click();
    await expect(
      page.getByText("Consentimento de apoio de IA não está válido para este paciente."),
    ).toBeVisible();
  });

  test("secretária é redirecionada para /app", async ({ page }) => {
    await loginViaUi(page);
    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);

    await page.goto("/app/supervisor");
    await page.waitForURL(/\/app$/);
  });
});
