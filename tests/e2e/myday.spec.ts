import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

async function setStubGoogleConnection(
  status: "connected" | "disconnected",
  extras: { nextSession?: "google" } = {},
) {
  const port = process.env.AUTH_STUB_PORT ?? "54331";
  const response = await fetch(`http://127.0.0.1:${port}/e2e/google-connection`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, ...extras }),
  });
  if (!response.ok) {
    throw new Error(`failed to set stub google connection: ${response.status}`);
  }
}

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
    await expect(
      page.getByText("Um dia de cada vez — presença e cuidado na rotina clínica."),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Agenda de Hoje" }),
    ).toBeVisible();
    const todayAgenda = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Agenda de Hoje" }),
    });
    await expect(todayAgenda.getByText("Beatriz • PAC-001").first()).toBeVisible();
    await expect(page.getByText("Reunião do conselho regional")).toHaveCount(0);
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

    const scheduled = page
      .getByRole("listitem")
      .filter({ hasText: "Beatriz • PAC-001" })
      .filter({ hasText: "Agendada" });
    if ((await scheduled.count()) > 0) {
      await scheduled.getByRole("button", { name: "Confirmar" }).click();
    }
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Beatriz • PAC-001" })
        .filter({ hasText: "Confirmada" }),
    ).toBeVisible();
  });

  test("Google conectado mostra evento externo no Meu Dia e na Agenda, com Atender", async ({
    page,
  }) => {
    await loginViaUi(page);
    try {
      await setStubGoogleConnection("connected");
      await page.reload();

      const googleRow = page
        .getByRole("listitem")
        .filter({ hasText: "Reunião do conselho regional" });
      await expect(googleRow).toBeVisible();
      await expect(googleRow.getByText("Google")).toBeVisible();
      await expect(googleRow).toHaveAttribute("data-appointment-visual", "active");
      await expect(googleRow).toHaveCSS("background-color", "rgb(52, 168, 83)");
      await expect(googleRow.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
      await expect(googleRow.getByRole("button", { name: "Atender" })).toBeVisible();
      await expect(googleRow.getByRole("button", { name: "Marcar Falta" })).toHaveCount(0);
      await expect(googleRow.getByRole("link", { name: /WhatsApp/ })).toHaveCount(0);

      await page.goto("/app/agenda");
      const agendaEvent = page
        .locator("[data-appointment-origin='GOOGLE_EXTERNAL']")
        .filter({ hasText: "Reunião do conselho regional" });
      await expect(agendaEvent.first()).toBeVisible();
      await expect(agendaEvent.first()).toHaveAttribute("data-appointment-visual", "active");
      await expect(agendaEvent.first().getByText("Google")).toBeVisible();
      await expect(agendaEvent.first().getByRole("button", { name: "Atender" })).toBeVisible();
    } finally {
      await setStubGoogleConnection("disconnected");
    }
  });

  test("Próxima sessão Google sem paciente mostra Atender", async ({ page }) => {
    await loginViaUi(page);
    try {
      await setStubGoogleConnection("connected", { nextSession: "google" });
      await page.reload();

      const nextCard = page.locator("section").filter({ hasText: "Próxima sessão" });
      await expect(nextCard).toHaveAttribute("data-appointment-origin", "GOOGLE_EXTERNAL");
      await expect(nextCard.getByText("Reunião do conselho regional")).toBeVisible();
      await expect(nextCard.getByRole("button", { name: "Atender" })).toBeVisible();
    } finally {
      await setStubGoogleConnection("disconnected");
    }
  });

  test("Vincular e atender no Google externo persiste paciente e abre a sessão", async ({
    page,
  }) => {
    await loginViaUi(page);
    try {
      await setStubGoogleConnection("connected");
      await page.reload();

      const googleRow = page
        .getByRole("listitem")
        .filter({ hasText: "Reunião do conselho regional" });
      await googleRow.getByRole("button", { name: "Atender" }).click();
      await expect(page.getByRole("heading", { name: "Vincular paciente" })).toBeVisible();
      await page.getByRole("searchbox", { name: "Buscar paciente" }).fill("Beatriz");
      await expect(page.getByRole("button", { name: /Beatriz/ })).toBeVisible();
      await page.getByRole("button", { name: /Beatriz/ }).click();
      await page.getByRole("button", { name: "Vincular e atender" }).click();
      await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);
    } finally {
      await setStubGoogleConnection("disconnected");
    }
  });
});
