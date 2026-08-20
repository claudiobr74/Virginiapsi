import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

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

async function startSession(page: Page, patientId: string): Promise<string> {
  await page.goto(`/app/patients/${patientId}`);
  await page.getByRole("button", { name: "Iniciar sessão" }).click();
  await page.waitForURL(/\/session\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

test.describe("Consentimentos — gate de captura (Fase 6: grant real)", () => {
  test("sem consentimento, o session_capture_grant é negado", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Um");
    const sessionId = await startSession(page, patientId);

    const response = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("consent_missing");
  });

  test("com consentimento válido o grant é emitido de fato", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Dois");
    await recordAllCaptureConsents(page);
    const sessionId = await startSession(page, patientId);

    const response = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(typeof body.grant).toBe("string");
    expect(body.grant.split(".")).toHaveLength(2);
    expect(body.expiresInMs).toBeGreaterThan(0);
  });

  test("revogar bloqueia de novo a emissão do grant", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Tres");
    await recordAllCaptureConsents(page);
    const sessionId = await startSession(page, patientId);

    await page.goto(`/app/patients/${patientId}`);
    await page.getByRole("button", { name: "Revogar Gravação da sessão" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revogar", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Registrar Gravação da sessão" }),
    ).toBeVisible();

    const response = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("consent_revoked");
  });

  test("upload-grant do fallback segue o mesmo gate de consentimento", async ({ page }) => {
    // A emissão do signed upload URL depende da Storage API real do
    // Supabase, que este stub (auth REST apenas) não replica — coberto pelo
    // adapter unitário de src/lib/integrations/transcription/fallback-storage.ts.
    // O que é testável e crítico aqui é a recusa sem consentimento.
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Um");
    const sessionId = await startSession(page, patientId);

    const response = await page.request.post("/api/session-capture/upload-grant", {
      data: { patientId, sessionId },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("consent_missing");
  });

  test("secretária não inicia sessão nem obtém grant", async ({ page }) => {
    await loginViaUi(page);
    const patientId = await openPatient(page, "Consentimento Um");
    const sessionId = await startSession(page, patientId);

    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);

    const response = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("forbidden_role");
  });

  test("sem sessão autenticada a rota de capability não emite nada", async ({
    request,
  }) => {
    const response = await request.post("/api/session-capture/grant", {
      data: {
        patientId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
      },
      maxRedirects: 0,
    });
    // O gate de autenticação redireciona para /login antes de qualquer
    // resolução de consentimento.
    expect([307, 401, 403]).toContain(response.status());
    expect(await response.text()).not.toContain('"grant"');
  });
});
