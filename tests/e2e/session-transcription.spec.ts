import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

const CAPTURE_LABELS = [
  "Apoio de IA",
  "Gravação da sessão",
  "Transcrição da sessão",
] as const;

const PERSISTED_TEXT = "Frase curta persistida no prontuário.";

async function openPatient(page: Page, preferredName: string): Promise<string> {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
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
  test("grant válido persiste trecho e o texto permanece após reload", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Dois");
    await recordAllCaptureConsents(page);
    const sessionId = await startSession(page, patientId);

    await expect(page.getByRole("heading", { name: "Transcrição" })).toBeVisible();
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
        text: PERSISTED_TEXT,
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
    await expect(page.getByText(PERSISTED_TEXT)).toBeVisible();
    await expect(page.getByText("Nenhum trecho transcrito ainda nesta sessão.")).toHaveCount(0);
  });
});
