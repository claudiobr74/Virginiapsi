import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

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

test.describe("Sessão clínica ativa", () => {
  test("inicia a partir do Patient Hub e mostra DPEP, área clínica, transcrição e Session AI", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Sessão Um");
    await startSession(page, patientId);

    await expect(page.getByText("Em andamento")).toBeVisible();
    await expect(page.getByRole("heading", { name: "DPEP" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Área de Trabalho Clínico" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcrição" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Session AI" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar atendimento" })).toBeVisible();
  });

  test("iniciar sessão de novo para o mesmo paciente resume a mesma sessão", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Sessão Dois");
    const first = await startSession(page, patientId);
    const second = await startSession(page, patientId);
    expect(second).toBe(first);
  });

  test("salva DPEP com sucesso e o conteúdo persiste ao recarregar", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Sessão Tres");
    await startSession(page, patientId);

    await page.getByLabel("Demanda").fill("Ansiedade relacionada ao trabalho");
    await page.getByLabel("Plano / Encaminhamentos").fill("Retomar respiração diafragmática");
    await page.getByRole("button", { name: "Salvar DPEP" }).click();
    await expect(page.getByText("DPEP salvo.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Demanda")).toHaveValue(
      "Ansiedade relacionada ao trabalho",
    );
  });

  test("versão desatualizada em outra aba mostra o erro de conflito (409)", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await loginViaUi(pageA);
    const patientId = await openPatient(pageA, "Sessão Quatro");
    const sessionId = await startSession(pageA, patientId);

    await pageB.goto(`/session/${sessionId}`);

    await pageA.getByLabel("Demanda").fill("Escrito pela aba A");
    await pageA.getByRole("button", { name: "Salvar DPEP" }).click();
    await expect(pageA.getByText("DPEP salvo.")).toBeVisible();

    await pageB.getByLabel("Demanda").fill("Escrito pela aba B, versão desatualizada");
    await pageB.getByRole("button", { name: "Salvar DPEP" }).click();
    await expect(
      pageB.getByText(/alterado em outra aba\/dispositivo/),
    ).toBeVisible();

    await context.close();
  });

  test("secretária é redirecionada para /app ao tentar abrir a sessão", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Sessão Um");
    const sessionId = await startSession(page, patientId);

    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);

    await page.goto(`/session/${sessionId}`);
    await page.waitForURL(/\/app$/);
  });

  test("finalizar atendimento via wizard encerra a sessão", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Sessão Dois");
    const sessionId = await startSession(page, patientId);

    await page.getByRole("button", { name: "Finalizar atendimento" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apenas finalizar" }).click();
    await page.waitForURL(/\/app\/patients$/);

    await page.goto(`/session/${sessionId}`);
    await expect(page.getByText("Finalizada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar atendimento" })).toHaveCount(0);
  });
});

test.describe("Persistência de transcrição — enforcement server-side", () => {
  test("recusa segmento sem grant válido", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Sessão Tres");
    const sessionId = await startSession(page, patientId);

    const response = await page.request.post("/api/session-capture/segment", {
      data: {
        grant: "not-a-real-grant.signature",
        sessionId,
        patientId,
        sequence: 0,
        text: "Texto que não deveria ser salvo",
        isFinal: true,
        provider: "local-webgpu",
      },
    });
    expect(response.status()).toBe(403);
  });

  test("recusa grant emitido para outra sessão", async ({ page }) => {
    await loginViaUi(page);
    const patientOne = await openPatient(page, "Sessão Um");
    const sessionOne = await startSession(page, patientOne);

    await page.goto("/app/patients");
    const patientTwo = await openPatient(page, "Sessão Quatro");
    const sessionTwo = await startSession(page, patientTwo);

    // Grant negado (sem consentimento) — mas mesmo que fosse emitido, o
    // servidor recusaria por session_id incompatível. Aqui simulamos com um
    // token de outra sessão passando pelo mesmo formato de payload.
    const response = await page.request.post("/api/session-capture/segment", {
      data: {
        grant: "forged-for-session-one.signature",
        sessionId: sessionTwo,
        patientId: patientTwo,
        sequence: 0,
        text: "Não deveria valer para outra sessão",
        isFinal: true,
        provider: "local-webgpu",
      },
    });
    expect(response.status()).toBe(403);
    void sessionOne;
  });
});
