import { expect, test, type TestInfo } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

/**
 * The Playwright webServer (and its stub) is a single shared process across
 * every project (desktop/mobile). Tests that leave an *active* appointment
 * behind must pick a date unique per project+test, otherwise the second
 * project to run collides with the first project's leftover appointment.
 */
function uniqueDateForTest(testInfo: TestInfo, baseYear = 2027): string {
  const key = `${testInfo.project.name}:${testInfo.title}`;
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const date = new Date(Date.UTC(baseYear, 0, 1));
  date.setUTCDate(date.getUTCDate() + (hash % 3000));
  return date.toISOString().slice(0, 10);
}

test.describe("Agenda — visão do dia", () => {
  test("mostra a consulta gerenciada e o evento externo somente leitura", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByText("Beatriz Lima • PAC-001")).toBeVisible();
    await expect(page.getByText("Reunião do conselho regional")).toBeVisible();
    await expect(page.getByText("Evento Google").first()).toBeVisible();

    // Sem conexão Google, a Agenda deve avisar mas continuar funcional.
    await expect(page.getByText("Google Agenda não conectada")).toBeVisible();
  });

  test("evento externo é somente leitura no drawer de detalhes", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await page.getByText("Reunião do conselho regional").click();

    await expect(
      page.getByRole("heading", { name: "Evento Google" }),
    ).toBeVisible();
    await expect(page.getByText("Somente leitura", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Este evento vem do Google Calendar e é somente leitura no VirgíniaPsi.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar consulta" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remarcar" })).toHaveCount(0);
  });

  test("alterna entre as visões de dia, semana e mês", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await page.getByRole("button", { name: "Semana" }).click();
    await expect(page).toHaveURL(/view=week/);

    await page.getByRole("button", { name: "Mês" }).click();
    await expect(page).toHaveURL(/view=month/);

    await page.getByRole("button", { name: "Dia" }).click();
    await expect(page).toHaveURL(/view=day/);
  });
});

test.describe("Agenda — nova consulta", () => {
  test("cria uma consulta gerenciada em um horário livre", async ({ page }, testInfo) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await page.getByRole("button", { name: "Nova consulta" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova consulta" }),
    ).toBeVisible();

    await page.getByLabel("Data").fill(uniqueDateForTest(testInfo));
    await page.getByLabel("Horário").fill("16:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();

    await expect(
      page.getByRole("heading", { name: "Nova consulta" }),
    ).toHaveCount(0);
  });

  test("detecta conflito ao agendar no mesmo horário de uma consulta existente", async ({
    page,
  }, testInfo) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");
    const date = uniqueDateForTest(testInfo);

    // Primeira consulta às 11:00 de um dia livre.
    await page.getByRole("button", { name: "Nova consulta" }).click();
    await page.getByLabel("Data").fill(date);
    await page.getByLabel("Horário").fill("11:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova consulta" }),
    ).toHaveCount(0);

    // Segunda consulta sobrepondo o mesmo horário.
    await page.getByRole("button", { name: "Nova consulta" }).click();
    await page.getByLabel("Data").fill(date);
    await page.getByLabel("Horário").fill("11:20");
    await page.getByLabel("Duração (minutos)").fill("30");
    await page.getByRole("button", { name: "Agendar" }).click();

    await expect(
      page.getByText("Já existe uma sessão agendada nesse horário."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Agendar mesmo assim" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova consulta" }),
    ).toHaveCount(0);
  });
});

test.describe("Agenda — gestão de consulta existente", () => {
  test("confirma e depois cancela uma consulta gerenciada", async ({ page }) => {
    // Cria uma consulta isolada (sem paciente vinculado) em vez de usar o
    // seed global "Beatriz Lima • PAC-001": este teste roda em múltiplos
    // projetos (desktop/mobile) contra o mesmo servidor stub, e cancelar o
    // seed compartilhado quebraria outros testes que dependem dele.
    await loginViaUi(page);
    await page.goto("/app/agenda?view=day&date=2026-06-08");

    await page.getByRole("button", { name: "Nova consulta" }).click();
    await page.getByLabel("Data").fill("2026-06-08");
    await page.getByLabel("Horário").fill("15:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova consulta" }),
    ).toHaveCount(0);

    await page.getByText("Sem paciente vinculado").click();
    await expect(
      page.getByRole("heading", { name: "Detalhes da consulta" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Confirmada").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancelar consulta" }).click();
    await expect(
      page.getByRole("heading", { name: "Cancelar consulta?" }),
    ).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancelar consulta" })
      .click();

    await expect(page.getByText("Sem paciente vinculado")).toHaveCount(0);
  });
});

test.describe("Agenda — conexão Google Agenda", () => {
  test("página de conexão mostra status desconectado e ação de conectar", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda/connect");

    await expect(
      page.getByRole("heading", { name: "Conexão com o Google Agenda" }),
    ).toBeVisible();
    await expect(page.getByText("Não conectado")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Conectar Google Agenda" }),
    ).toBeVisible();

    // A troca de código/OAuth real com accounts.google.com não é testável
    // neste ambiente sem credenciais reais (EXTERNAL_BLOCKED) — cobrimos até
    // aqui: o botão existe, é admin-only e a rota /api/integrations/google/start
    // exige sessão autenticada (ver testes de integração dos adapters).
  });
});
