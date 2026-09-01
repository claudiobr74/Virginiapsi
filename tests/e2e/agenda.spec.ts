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
  test("mostra a consulta gerenciada e esconde eventos Google com Agenda desconectada", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
    await expect(page.getByText("Beatriz Lima • PAC-001")).toBeVisible();
    await expect(page.getByText("Reunião do conselho regional")).toHaveCount(0);
    await expect(page.getByText("Evento externo do Google")).toHaveCount(0);

    // Sem conexão Google, a Agenda deve avisar mas continuar funcional.
    await expect(page.getByText("Google Calendar não conectado")).toBeVisible();
  });

  test("evento externo do Google não aparece com a Agenda desconectada", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await expect(page.getByText("Beatriz Lima • PAC-001")).toBeVisible();
    await expect(page.getByText("Reunião do conselho regional")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Evento externo do Google" }),
    ).toHaveCount(0);
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

  test("cores seguem o status clínico em dia, semana e mês", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    const views = [
      { name: "Dia", heading: "Agenda Diária" },
      { name: "Semana", heading: "Agenda Semanal" },
      { name: "Mês", heading: "Agenda Mensal" },
    ] as const;

    for (const view of views) {
      await page.getByRole("button", { name: view.name }).click();
      await expect(page.getByRole("heading", { name: view.heading })).toBeVisible();

      const active = page
        .locator("[data-appointment-visual]")
        .filter({ hasText: /Beatriz/ })
        .first();
      const completed = page
        .locator("[data-appointment-visual]")
        .filter({ hasText: "Consulta B" })
        .first();
      const cancelled = page
        .locator("[data-appointment-visual]")
        .filter({ hasText: "Consulta C" })
        .first();
      const desmarcou = page
        .locator("[data-appointment-visual]")
        .filter({ hasText: "Vinicius-2(desmarcou)" })
        .first();

      await expect(active).toHaveAttribute("data-appointment-visual", "active");
      await expect(active).toHaveCSS("background-color", "rgb(234, 246, 237)");
      await expect(completed).toHaveAttribute("data-appointment-visual", "completed");
      await expect(completed).toHaveCSS("background-color", "rgb(237, 244, 252)");
      await expect(cancelled).toHaveAttribute("data-appointment-visual", "cancelled");
      await expect(cancelled).toHaveCSS("background-color", "rgb(252, 238, 238)");
      await expect(desmarcou).toHaveAttribute("data-appointment-visual", "cancelled");
      await expect(desmarcou).toHaveCSS("background-color", "rgb(252, 238, 238)");
    }
  });
});

test.describe("Agenda — nova consulta", () => {
  test("cria uma consulta gerenciada em um horário livre", async ({ page }, testInfo) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");

    await page.getByRole("button", { name: "Novo agendamento" }).click();
    await expect(
      page.getByRole("heading", { name: "Novo agendamento" }),
    ).toBeVisible();

    await page.getByLabel("Título").fill("Consulta avulsa livre");
    await page.getByLabel("Data").fill(uniqueDateForTest(testInfo));
    await page.getByLabel("Horário").fill("16:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();

    await expect(
      page.getByRole("heading", { name: "Novo agendamento" }),
    ).toHaveCount(0);
  });

  test("detecta conflito ao agendar no mesmo horário de uma consulta existente", async ({
    page,
  }, testInfo) => {
    await loginViaUi(page);
    await page.goto("/app/agenda");
    const date = uniqueDateForTest(testInfo);

    // Primeira consulta às 11:00 de um dia livre.
    await page.getByRole("button", { name: "Novo agendamento" }).click();
    await page.getByLabel("Título").fill("Consulta conflito 1");
    await page.getByLabel("Data").fill(date);
    await page.getByLabel("Horário").fill("11:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(
      page.getByRole("heading", { name: "Novo agendamento" }),
    ).toHaveCount(0);

    // Segunda consulta sobrepondo o mesmo horário.
    await page.getByRole("button", { name: "Novo agendamento" }).click();
    await page.getByLabel("Título").fill("Consulta conflito 2");
    await page.getByLabel("Data").fill(date);
    await page.getByLabel("Horário").fill("11:20");
    await page.getByLabel("Duração (minutos)").fill("30");
    await page.getByRole("button", { name: "Agendar" }).click();

    await expect(
      page.getByText("Já existe uma sessão agendada nesse horário."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Agendar mesmo assim" }).click();
    await expect(
      page.getByRole("heading", { name: "Novo agendamento" }),
    ).toHaveCount(0);
  });
});

test.describe("Agenda — gestão de consulta existente", () => {
  test("confirma e depois cancela uma consulta gerenciada", async ({ page }, testInfo) => {
    // Cria uma consulta isolada (sem paciente vinculado) em vez de usar o
    // seed global "Beatriz Lima • PAC-001": este teste roda em múltiplos
    // projetos (desktop/mobile) contra o mesmo servidor stub, e cancelar o
    // seed compartilhado quebraria outros testes que dependem dele.
    const date = uniqueDateForTest(testInfo, 2028);
    const title = `Consulta avulsa e2e ${testInfo.project.name} ${date}`;
    await loginViaUi(page);
    await page.goto(`/app/agenda?view=day&date=${date}`);

    await page.getByRole("button", { name: "Novo agendamento" }).click();
    await page.getByLabel("Título").fill(title);
    await page.getByLabel("Data").fill(date);
    await page.getByLabel("Horário").fill("15:00");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByRole("button", { name: "Agendar" }).click();
    await expect(
      page.getByRole("heading", { name: "Novo agendamento" }),
    ).toHaveCount(0);

    await page.getByText(title, { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Detalhes do agendamento" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Confirmada").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancelar/desmarcar" }).click();
    await expect(
      page.getByRole("heading", { name: "Cancelar/desmarcar este agendamento?" }),
    ).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancelar/desmarcar" })
      .click();

    await expect(
      page.locator("[data-appointment-visual='cancelled']").filter({ hasText: title }),
    ).toBeVisible();
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
    await expect(page.getByText("Não conectado")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Conectar Google Agenda" }),
    ).toBeVisible();
    await expect(page.getByText(/cadastre este endereço/i)).toHaveCount(0);

    // A troca de código/OAuth real com accounts.google.com não é testável
    // neste ambiente sem credenciais reais (EXTERNAL_BLOCKED) — cobrimos até
    // aqui: o botão existe, é admin-only e a rota /api/integrations/google/start
    // exige sessão autenticada (ver testes de integração dos adapters).
  });
});
