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
    await expect(page.getByLabel("Legenda da agenda")).toBeVisible();
    await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
    await expect(page.getByText("Realizado", { exact: true })).toBeVisible();
    await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();

    const managed = page.getByRole("button", { name: /Beatriz Lima • PAC-001/ });
    const external = page.getByRole("button", { name: /Reunião do conselho regional/ });
    await expect(managed).toBeVisible();
    await expect(external).toBeVisible();
    await expect(managed).toHaveAttribute("data-calendar-tone", "active");
    await expect(external).toHaveAttribute("data-calendar-tone", "external");
    await expect(external).toHaveAccessibleName(/Evento externo do Google/);

    // Sem conexão Google, a Agenda deve avisar mas continuar funcional.
    await expect(page.getByText("Google Calendar não conectado")).toBeVisible();
  });

  test("evento externo é somente leitura no drawer de detalhes", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await page.getByRole("button", { name: /Reunião do conselho regional/ }).click();

    await expect(
      page.getByRole("heading", { name: "Evento externo do Google" }),
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

    await page.getByRole("button", { name: "Semana", exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByRole("button", { name: /Beatriz Lima • PAC-001/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await expect(page).toHaveURL(/view=month/);
    await expect(page.getByRole("button", { name: /Beatriz Lima • PAC-001/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "Dia", exact: true }).click();
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
  test("confirma e depois cancela uma consulta gerenciada", async ({ page }, testInfo) => {
    // Data única por projeto: cancelados permanecem na grade, então desktop e
    // mobile não podem compartilhar o mesmo dia no stub.
    const date = uniqueDateForTest(testInfo);
    await loginViaUi(page);
    await page.goto(`/app/agenda?view=day&date=${date}`);

    await page.getByRole("button", { name: "Nova consulta" }).click();
    await page.getByLabel("Data").fill(date);
    await page.getByLabel("Horário").fill("15:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(
      page.getByRole("heading", { name: "Nova consulta" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /Sem paciente vinculado/ }).click();
    await expect(
      page.getByRole("heading", { name: "Detalhes da consulta" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Confirmado").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancelar consulta" }).click();
    await expect(
      page.getByRole("heading", { name: "Cancelar consulta?" }),
    ).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancelar consulta" })
      .click();

    await expect(page.getByText("Cancelado").first()).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();
    const cancelled = page.getByRole("button", { name: /Sem paciente vinculado/ });
    await expect(cancelled).toBeVisible();
    await expect(cancelled).toHaveAttribute("data-calendar-tone", "cancelled");
  });
});

test.describe("Agenda — conexão Google Calendar", () => {
  test("página de conexão mostra status desconectado e ação de conectar", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda/connect");

    await expect(
      page.getByRole("heading", { name: "Conexão com o Google Calendar" }),
    ).toBeVisible();
    await expect(page.getByText("Desconectado")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Conectar com o Google" }),
    ).toBeVisible();

    // A troca de código/OAuth real com accounts.google.com não é testável
    // neste ambiente sem credenciais reais (EXTERNAL_BLOCKED) — cobrimos até
    // aqui: o botão existe, é admin-only e a rota /api/integrations/google/start
    // exige sessão autenticada (ver testes de integração dos adapters).
  });
});
