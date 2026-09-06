import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";
import { getDailyPsychologyQuote } from "../../src/features/appearance/daily-quote";

async function setStubGoogleConnection(
  status: "connected" | "disconnected",
  extras: { nextSession?: "google" } = {},
) {
  // Phase 2 E2E runs through a front proxy on AUTH_STUB_PORT and keeps the
  // mutable fixture state in the backend stub one port above. Control hooks
  // must talk to that backend directly so fixture mutations are deterministic.
  const frontPort = Number(process.env.AUTH_STUB_PORT ?? "54331");
  const backendPort = frontPort + 1;
  const response = await fetch(`http://127.0.0.1:${backendPort}/e2e/google-connection`, {
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
      page.getByText(getDailyPsychologyQuote("America/Sao_Paulo")),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Agenda de Hoje" }),
    ).toBeVisible();
    // Visual Refresh V2 moved the heading into Card; the list lives in the
    // labelled section, so filtering `section` by the heading matched nothing.
    const todayAgenda = page.locator("section[aria-labelledby='timeline-heading']");
    await expect(todayAgenda.getByText("Beatriz • PAC-001").first()).toBeVisible();
    await expect(page.getByText("Reunião do conselho regional")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Atendimento Avulso" })).toBeVisible();
    await expect(page.getByText("Sessões esta semana")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Salas Google Meet" }),
    ).toBeVisible();
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
      await expect(googleRow).toHaveCSS("background-color", "rgb(234, 246, 237)");
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

  test("hierarquia visual: coluna principal e lateral, sem overflow", async ({
    page,
  }, testInfo) => {
    await loginViaUi(page);

    const nextSession = page.getByText("Próxima sessão").first();
    const agenda = page.getByRole("heading", { name: "Agenda de Hoje" });
    const meet = page.getByRole("heading", { name: "Salas Google Meet" });
    const finalize = page.getByRole("heading", { name: "Sessões a Finalizar" });
    const finance = page.getByRole("heading", { name: "Pendências Financeiras" });
    const tasks = page.getByRole("heading", { name: "Minhas Tarefas" });
    const documents = page.getByRole("heading", { name: "Documentos Gerados" });

    await expect(nextSession).toBeVisible();
    await expect(agenda).toBeVisible();
    await expect(meet).toBeVisible();

    const primaryColumn = page.locator("[data-myday-region='primary']");
    const nextCard = primaryColumn.locator(":scope > *").nth(0);
    const agendaCard = primaryColumn.locator(":scope > *").nth(1);

    const boxes = {
      next: await nextCard.boundingBox(),
      agenda: await agendaCard.boundingBox(),
      meet: await meet.boundingBox(),
      finalize: await finalize.boundingBox(),
      finance: await finance.boundingBox(),
      tasks: await tasks.boundingBox(),
      documents: await documents.boundingBox(),
    };
    for (const [name, box] of Object.entries(boxes)) {
      expect(box, `${name} deve estar no layout`).toBeTruthy();
    }

    const nextBox = boxes.next!;
    const agendaBox = boxes.agenda!;
    const meetBox = boxes.meet!;
    const finalizeBox = boxes.finalize!;
    const financeBox = boxes.finance!;
    const tasksBox = boxes.tasks!;
    const documentsBox = boxes.documents!;

    expect(agendaBox.y).toBeGreaterThan(nextBox.y);

    const viewport = page.viewportSize();
    if ((viewport?.width ?? 0) >= 1024) {
      // Compare the column cards, not the inner "Próxima sessão" badge vs the
      // Card heading (the heading is indented by ToneIcon ≈ 36px + gap).
      expect(Math.abs(agendaBox.x - nextBox.x)).toBeLessThan(48);
      expect(meetBox.x).toBeGreaterThan(nextBox.x + nextBox.width * 0.4);
      expect(meetBox.y).toBeLessThan(agendaBox.y);
      expect(finalizeBox.y).toBeGreaterThan(meetBox.y);
      expect(financeBox.y).toBeGreaterThan(finalizeBox.y);
      expect(tasksBox.y).toBeGreaterThan(financeBox.y);
      expect(documentsBox.y).toBeGreaterThan(tasksBox.y);
      expect(Math.abs(meetBox.x - finalizeBox.x)).toBeLessThan(48);
    } else {
      expect(meetBox.y).toBeGreaterThan(agendaBox.y);
      expect(finalizeBox.y).toBeGreaterThan(meetBox.y);
      expect(financeBox.y).toBeGreaterThan(finalizeBox.y);
      expect(tasksBox.y).toBeGreaterThan(financeBox.y);
      expect(documentsBox.y).toBeGreaterThan(tasksBox.y);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: `test-results/myday-layout-${testInfo.project.name}.png`,
      fullPage: true,
    });

    if (testInfo.project.name === "mobile-chromium") {
      await page.locator("header").first().screenshot({
        path: "test-results/myday-logo-mobile-topbar.png",
      });
    }

    if (testInfo.project.name === "desktop-chromium") {
      for (const size of [
        { width: 412, height: 915 },
        { width: 768, height: 1024 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
      ] as const) {
        await page.setViewportSize(size);
        await expect(agenda).toBeVisible();
        await expect(meet).toBeVisible();
        const extraOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(extraOverflow, `${size.width}x${size.height}`).toBeLessThanOrEqual(1);

        const resized = {
          next: await nextSession.boundingBox(),
          agenda: await agenda.boundingBox(),
          meet: await meet.boundingBox(),
          finalize: await finalize.boundingBox(),
        };
        expect(resized.agenda!.y).toBeGreaterThan(resized.next!.y);
        if (size.width >= 1024) {
          expect(resized.meet!.x).toBeGreaterThan(
            resized.next!.x + resized.next!.width * 0.4,
          );
          expect(resized.finalize!.y).toBeGreaterThan(resized.meet!.y);
        } else {
          expect(resized.meet!.y).toBeGreaterThan(resized.agenda!.y);
          expect(resized.finalize!.y).toBeGreaterThan(resized.meet!.y);
        }
      }

      await page.goto("/login");
      await expect(page.getByRole("img", { name: "VirgíniaPsi" })).toBeVisible();
      await page.screenshot({
        path: "test-results/login-logo-desktop.png",
        fullPage: false,
      });
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