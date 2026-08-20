import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

const CAPTURE_ENDPOINTS = [
  "/api/session-capture/grant",
  "/api/session-capture/upload-grant",
] as const;

const CAPTURE_LABELS = [
  "Apoio de IA",
  "Gravação da sessão",
  "Transcrição da sessão",
] as const;

/**
 * Each test mutates consent state, and every Playwright project shares one
 * stub process — so each test opens its own seeded patient instead of a
 * common one.
 */
async function openPatient(page: Page, preferredName: string): Promise<string> {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

/** Idempotent: a consent already recorded by another project is left as is. */
async function recordAllCaptureConsents(page: Page) {
  for (const label of CAPTURE_LABELS) {
    const register = page.getByRole("button", { name: `Registrar ${label}` });
    if ((await register.count()) > 0) {
      await register.click();
    }
    await expect(
      page.getByRole("button", { name: `Revogar ${label}` }),
    ).toBeVisible();
  }
}

test.describe("Consentimentos — gate de captura", () => {
  test("sem consentimento, token e upload grant são negados", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Um");

    for (const endpoint of CAPTURE_ENDPOINTS) {
      const response = await page.request.post(endpoint, { data: { patientId } });
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toBe("consent_missing");
    }
  });

  test("com consentimento válido o gate passa; a emissão fica para a Fase 6", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Dois");
    await recordAllCaptureConsents(page);

    for (const endpoint of CAPTURE_ENDPOINTS) {
      const response = await page.request.post(endpoint, { data: { patientId } });
      expect(response.status()).toBe(501);
      expect((await response.json()).error).toBe("capability_pending_phase_6");
    }
  });

  test("revogar bloqueia de novo o token live e o upload grant do fallback", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Tres");
    await recordAllCaptureConsents(page);

    await page.getByRole("button", { name: "Revogar Gravação da sessão" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revogar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Registrar Gravação da sessão" }),
    ).toBeVisible();

    for (const endpoint of CAPTURE_ENDPOINTS) {
      const response = await page.request.post(endpoint, { data: { patientId } });
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toBe("consent_revoked");
    }
  });

  test("secretária não vê a seção de consentimentos nem obtém capability", async ({
    page,
  }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Um");

    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);
    await page.goto(`/app/patients/${patientId}`);

    await expect(
      page.getByText("Consentimentos de gravação, transcrição e IA"),
    ).toHaveCount(0);

    const response = await page.request.post(CAPTURE_ENDPOINTS[0], {
      data: { patientId },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("forbidden_role");
  });

  test("sem sessão autenticada a rota de capability não emite nada", async ({
    request,
  }) => {
    const response = await request.post(CAPTURE_ENDPOINTS[0], {
      data: { patientId: "11111111-1111-4111-8111-111111111111" },
      maxRedirects: 0,
    });
    // O gate de autenticação redireciona para /login antes de qualquer
    // resolução de consentimento.
    expect([307, 401, 403]).toContain(response.status());
    expect(await response.text()).not.toContain("capability_pending_phase_6");
  });
});
