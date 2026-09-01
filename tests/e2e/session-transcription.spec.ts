import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

const CAPTURE_LABELS = [
  "Apoio de IA",
  "Gravação da sessão",
  "Transcrição da sessão",
] as const;

/**
 * Each Playwright project shares one in-memory auth stub, and
 * `start_clinical_session` reuses an in-progress session for the same patient.
 * A fixed seed like "Consentimento Dois" therefore leaks desktop persistence
 * into mobile (empty state disappears before the grant). This spec creates a
 * unique adult patient per run so desktop and mobile stay isolated.
 */
async function createIsolatedCapturePatient(
  page: Page,
  preferredName: string,
): Promise<string> {
  await page.goto("/app/patients/new");
  await page.getByLabel("Nome preferencial").fill(preferredName);
  await page.getByLabel("Nome completo").fill(`${preferredName} Completo`);
  await page.getByLabel("Data de nascimento").fill("1990-05-10");
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

async function recordAllCaptureConsents(page: Page) {
  await page.getByRole("tab", { name: "TCLE" }).click();
  for (const label of CAPTURE_LABELS) {
    const register = page.getByRole("button", { name: `Registrar ${label}` });
    if ((await register.count()) > 0) {
      await register.click();
    }
    await expect(page.getByRole("button", { name: `Revogar ${label}` })).toBeVisible();
  }
}

async function startSession(page: Page, patientId: string): Promise<string> {
  await page.goto(`/app/patients/${patientId}`);
  await page.getByRole("button", { name: "Iniciar sessão" }).click();
  await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

test.describe("Transcrição em sessão — grant e persistência", () => {
  test("grant válido persiste trecho e o texto permanece após reload", async ({
    page,
  }, testInfo) => {
    const runId = crypto.randomUUID().slice(0, 8);
    const preferredName = `Captura ${testInfo.project.name} ${runId}`;
    const persistedText = `Trecho sintético ${testInfo.project.name} ${runId}`;

    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(page, preferredName);
    await recordAllCaptureConsents(page);
    const sessionId = await startSession(page, patientId);

    await expect(page.getByRole("heading", { name: "Transcrição em tempo real" })).toBeVisible();
    await expect(page.getByText("Nenhum trecho transcrito ainda nesta sessão.")).toBeVisible();

    const grantResponse = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(grantResponse.status()).toBe(200);
    const grantBody = (await grantResponse.json()) as { grant: string };
    expect(typeof grantBody.grant).toBe("string");

    const persistResponse = await page.request.post("/api/session-capture/segment", {
      data: {
        grant: grantBody.grant,
        sessionId,
        patientId,
        sequence: 0,
        text: persistedText,
        isFinal: true,
        startMs: 0,
        endMs: 1500,
        provider: "local-webgpu",
      },
    });
    expect(persistResponse.status()).toBe(200);
    const persistBody = (await persistResponse.json()) as { ok?: boolean; duplicate?: boolean };
    expect(persistBody.ok).toBe(true);

    await page.reload();
    await expect(page.getByText(persistedText)).toBeVisible();
    await expect(page.getByText("Nenhum trecho transcrito ainda nesta sessão.")).toHaveCount(0);
  });
});
