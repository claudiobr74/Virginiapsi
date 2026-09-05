import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, productAlert } from "./support/fixtures";

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

    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(page, preferredName);
    await recordAllCaptureConsents(page);
    const sessionId = await startSession(page, patientId);

    await expect(page.getByRole("heading", { name: "Transcrição" })).toBeVisible();
    await expect(page.getByText("Nenhum trecho ainda.")).toBeVisible();

    const grantResponse = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(grantResponse.status()).toBe(200);
    const grantBody = (await grantResponse.json()) as { grant: string };
    expect(typeof grantBody.grant).toBe("string");

    const persistResponse = await page.request.post("/api/session-capture/transcribe-chunk", {
      multipart: {
        grant: grantBody.grant,
        patientId,
        sessionId,
        chunkId: crypto.randomUUID(),
        sequence: "0",
        startMs: "0",
        endMs: "1500",
        audio: {
          name: "chunk.webm",
          mimeType: "audio/webm",
          buffer: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
        },
      },
    });
    expect(persistResponse.status()).toBe(200);
    const persistBody = (await persistResponse.json()) as { ok?: boolean; already_processed?: boolean };
    expect(persistBody.ok).toBe(true);

    await page.reload();
    await expect(page.getByText("Trecho transcrito no stub Groq.")).toBeVisible();
    await expect(page.getByText("Nenhum trecho ainda.")).toHaveCount(0);
  });

  test("transcribe-chunk via Groq stub persiste e o replay não duplica", async ({
    page,
  }, testInfo) => {
    const runId = crypto.randomUUID().slice(0, 8);
    const preferredName = `Groq ${testInfo.project.name} ${runId}`;

    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(page, preferredName);
    await recordAllCaptureConsents(page);
    const sessionId = await startSession(page, patientId);

    const grantResponse = await page.request.post("/api/session-capture/grant", {
      data: { patientId, sessionId },
    });
    expect(grantResponse.status()).toBe(200);
    const grantBody = (await grantResponse.json()) as { grant: string };

    const chunkId = crypto.randomUUID();
    const first = await page.request.post("/api/session-capture/transcribe-chunk", {
      multipart: {
        grant: grantBody.grant,
        patientId,
        sessionId,
        chunkId,
        sequence: "0",
        startMs: "0",
        endMs: "15000",
        audio: {
          name: "chunk.webm",
          mimeType: "audio/webm",
          buffer: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
        },
      },
    });
    expect(first.status()).toBe(200);
    const firstBody = (await first.json()) as {
      ok: boolean;
      already_processed: boolean;
      segment: { text: string } | null;
    };
    expect(firstBody.ok).toBe(true);
    expect(firstBody.already_processed).toBe(false);
    expect(firstBody.segment?.text).toBe("Trecho transcrito no stub Groq.");

    const replay = await page.request.post("/api/session-capture/transcribe-chunk", {
      multipart: {
        grant: grantBody.grant,
        patientId,
        sessionId,
        chunkId,
        sequence: "0",
        startMs: "0",
        endMs: "15000",
        audio: {
          name: "chunk.webm",
          mimeType: "audio/webm",
          buffer: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
        },
      },
    });
    expect(replay.status()).toBe(200);
    const replayBody = (await replay.json()) as { already_processed: boolean };
    expect(replayBody.already_processed).toBe(true);

    await page.reload();
    await expect(page.getByText("Trecho transcrito no stub Groq.")).toBeVisible();
  });

  test("iniciar e parar transcrição usa o microfone sem baixar modelo", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-webkit",
      "Fake MediaStream flags are Chromium-only in this Playwright config.",
    );
    const runId = crypto.randomUUID().slice(0, 8);
    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(
      page,
      `Mic ${testInfo.project.name} ${runId}`,
    );
    await recordAllCaptureConsents(page);
    await startSession(page, patientId);

    await expect(page.getByText("baixando modelo")).toHaveCount(0);
    await page.getByRole("button", { name: "Iniciar transcrição" }).click();
    await expect(page.getByText(/Gravando|Preparando|Conexão instável|Cópia local|Gravação local/)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Parar transcrição" }).click();
    await expect(page.getByText(/Transcrição finalizada|Transcrição parada/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("falha de rede no chunk preserva recuperação após stop", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-webkit",
      "MediaRecorder fake-device e IndexedDB CryptoKey nesta rodada: Chromium.",
    );
    const runId = crypto.randomUUID().slice(0, 8);
    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(
      page,
      `Offline ${testInfo.project.name} ${runId}`,
    );
    await recordAllCaptureConsents(page);
    await startSession(page, patientId);

    await page.route("**/api/session-capture/transcribe-chunk", (route) =>
      route.abort("failed"),
    );
    await page.getByRole("button", { name: "Iniciar transcrição" }).click();
    await expect(page.getByText(/Gravando|Preparando|Conexão instável|Cópia local|Gravação local/)).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1_200);
    await page.getByRole("button", { name: "Parar transcrição" }).click();
    await expect(
      page
        .getByRole("button", { name: "Continuar processamento" })
        .or(page.getByText(/Sessão encerrada|gravação local de segurança|não puderam ser preservados/i))
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.unroute("**/api/session-capture/transcribe-chunk");
    const recover = page.getByRole("button", { name: "Continuar processamento" });
    if ((await recover.count()) > 0) {
      await recover.click();
      await expect(page.getByText("Trecho transcrito no stub Groq.")).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("importar gravação persiste texto via Groq stub", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-webkit",
      "Upload signed URL + Storage stub: Chromium nesta rodada.",
    );
    const runId = crypto.randomUUID().slice(0, 8);
    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(
      page,
      `Import ${testInfo.project.name} ${runId}`,
    );
    await recordAllCaptureConsents(page);
    await startSession(page, patientId);

    await page.locator('input[type="file"]').setInputFiles({
      name: "sessao.webm",
      mimeType: "audio/webm",
      buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]),
    });
    await expect(page.getByText("Gravação importada e transcrita.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Trecho transcrito no stub Groq.")).toBeVisible();
  });

  test("grant 403 não inicia captura de microfone", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-webkit",
      "Fake MediaStream flags are Chromium-only in this Playwright config.",
    );
    const runId = crypto.randomUUID().slice(0, 8);
    await page.addInitScript(() => {
      Object.defineProperty(window, "__gumCalls", { value: 0, writable: true });
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        (window as unknown as { __gumCalls: number }).__gumCalls += 1;
        return original(constraints);
      };
    });
    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(
      page,
      `Grant403 ${testInfo.project.name} ${runId}`,
    );
    await recordAllCaptureConsents(page);
    await startSession(page, patientId);

    await page.route("**/api/session-capture/grant", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "consent_outdated",
          message:
            "O consentimento de transcrição precisa ser registrado novamente — o áudio agora é enviado de forma segura para gerar o texto em tempo real.",
        }),
      }),
    );

    await page.getByRole("button", { name: "Iniciar transcrição" }).click();
    await expect(productAlert(page, /consentimento de transcrição/i)).toBeVisible({
      timeout: 15_000,
    });
    expect(await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls)).toBe(
      0,
    );
  });

  test("CryptoKey não persistível não afirma backup criptografado offline", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-webkit",
      "MediaRecorder fake-device nesta rodada: Chromium.",
    );
    const runId = crypto.randomUUID().slice(0, 8);
    await page.addInitScript(() => {
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function patchedPut(value, key) {
        if (typeof CryptoKey !== "undefined" && value instanceof CryptoKey) {
          throw new DOMException("The object could not be cloned.", "DataCloneError");
        }
        return originalPut.call(this, value, key);
      };
    });
    await loginViaUi(page);
    const patientId = await createIsolatedCapturePatient(
      page,
      `SpoolFail ${testInfo.project.name} ${runId}`,
    );
    await recordAllCaptureConsents(page);
    await startSession(page, patientId);

    await page.route("**/api/session-capture/transcribe-chunk", (route) =>
      route.abort("failed"),
    );
    await page.getByRole("button", { name: "Iniciar transcrição" }).click();
    await expect(page.getByText(/Gravando|Preparando|Conexão instável|Não foi possível ativar/)).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1_200);
    await page.getByRole("button", { name: "Parar transcrição" }).click();
    await expect(
      page.getByText(/Não foi possível ativar a gravação local de segurança|não puderam ser preservados/i),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(
        /preservados de forma criptografada|ficam criptografados neste dispositivo/i,
      ),
    ).toHaveCount(0);
  });
});
