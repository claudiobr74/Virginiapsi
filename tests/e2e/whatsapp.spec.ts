import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

async function openPatient(page: Page, preferredName: string) {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
}

function whatsappPanel(page: Page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "WhatsApp", exact: true }),
  });
}

test.describe("WhatsApp — preferência, job e webhooks", () => {
  test("admin registra consentimento, ativa o canal e vê os modelos", async ({ page }) => {
    await loginViaUi(page);
    await openPatient(page, "Canal Um");

    const panel = whatsappPanel(page);
    await expect(panel.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();

    const register = panel.getByRole("button", { name: "Registrar consentimento" });
    if ((await register.count()) > 0) {
      await register.click();
      await expect(panel.getByRole("button", { name: "Revogar consentimento" })).toBeVisible();
    }

    const activate = panel.getByRole("button", { name: "Ativar canal" });
    if ((await activate.count()) > 0) {
      await activate.click();
    }

    await expect(panel.getByText("Ativo", { exact: true })).toBeVisible();
    await expect(panel.getByText("Confirmação de agendamento")).toBeVisible();
    await expect(panel.getByText("Lembrete 24h")).toBeVisible();
  });

  test("secretária vê o painel administrativo de WhatsApp", async ({ page }) => {
    await loginViaUi(page);
    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);
    await openPatient(page, "Canal Dois");
    await expect(page.getByRole("heading", { name: "WhatsApp", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar consentimento" })).toBeVisible();
  });

  test("job rejeita CRON_SECRET inválido sem processar a fila", async ({ request }) => {
    const response = await request.post("/api/jobs/whatsapp-reminders", {
      headers: { "x-cron-secret": "segredo-errado-e-comprido" },
      data: { source: "test" },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("webhook de status recusa quando Twilio está desativado", async ({ request }) => {
    const response = await request.post("/api/webhooks/twilio/status", {
      form: { MessageSid: "SMinvalid", MessageStatus: "delivered" },
      headers: { "X-Twilio-Signature": "assinatura-invalida" },
    });
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });

  test("webhook inbound recusa quando Twilio está desativado", async ({ request }) => {
    const response = await request.post("/api/webhooks/twilio/inbound", {
      form: { MessageSid: "SMno-sig", From: "whatsapp:+5511999999999", Body: "SIM" },
    });
    expect(response.status()).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });
});
