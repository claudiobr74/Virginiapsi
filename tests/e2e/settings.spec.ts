import { expect, test } from "@playwright/test";
import { loginViaUi, productAlert, signIn, STUB_SECRETARY } from "./support/fixtures";

test.describe("Configurações", () => {
  test("secretária vê acesso restrito em /app/settings", async ({ page }) => {
    await loginViaUi(page);
    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);

    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Acesso restrito" })).toBeVisible();
    await expect(
      page.getByText(/Você não tem permissão para abrir as Configurações/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar ao Início" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Configurações", exact: true })).toHaveCount(0);
  });

  test("admin vê as oito seções e diagnósticos sem secrets", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/settings");

    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    for (const label of [
      "Meu Perfil",
      "Consultório",
      "Aparência",
      "Segurança",
      "Equipe e Acessos",
      "Integrações",
      "Backup e Recuperação",
      "Zona de Risco",
    ]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }

    await page.getByRole("tab", { name: "Integrações" }).click();
    await expect(page.getByText("Google Agenda")).toBeVisible();
    await expect(page.getByRole("button", { name: "Conectar Google Agenda" })).toBeVisible();
    await page.getByRole("button", { name: "Conectar Google Agenda" }).click();
    await expect(productAlert(page, /localhost|computador/i)).toBeVisible();
    await expect(page.getByText("Twilio WhatsApp")).toBeVisible();
    await expect(page.getByText("Transcrição")).toBeVisible();
    await expect(page.getByText("Gemini")).toBeVisible();
    await expect(page.getByText("Padrão no dispositivo")).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/TWILIO_AUTH_TOKEN/);
    expect(body).not.toMatch(/GEMINI_API_KEY/);
    expect(body).not.toMatch(/CRON_SECRET/);
    expect(body).not.toMatch(/sb_secret_/);
    expect(body).not.toMatch(/SUPABASE_SECRET_KEY/);
  });

  test("admin atualiza o perfil e exporta a organização", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/settings");

    await page.getByRole("tab", { name: "Meu Perfil" }).click();
    await page.getByLabel("Nome de exibição").fill("Ana Serena Atualizada");
    await page.getByRole("button", { name: "Salvar perfil" }).click();
    await expect(page.getByText("Perfil atualizado.")).toBeVisible();

    await page.getByRole("tab", { name: "Backup e Recuperação" }).click();
    await expect(
      page.getByText(/recuperação de desastre é o backup do projeto Supabase/i),
    ).toBeVisible();

    // O stub in-memory é compartilhado entre desktop e mobile: exportações
    // anteriores continuam na lista. O teste afirma o incremento, não a unicidade.
    const orgExports = page.getByRole("listitem").filter({
      hasText: "Organização · tesseli-export-v1",
    });
    const before = await orgExports.count();

    await page.getByRole("button", { name: "Exportar organização" }).click();
    await expect(page.getByText("Exportação da organização pronta.")).toBeVisible();
    await expect(orgExports).toHaveCount(before + 1);
    await expect(
      orgExports.first().getByRole("button", { name: "Baixar", exact: true }),
    ).toBeVisible();
  });

  test("eliminação exige a frase correta", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/settings");
    await page.getByRole("tab", { name: "Zona de Risco" }).click();

    const patientSelect = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "Configurações Um" }) });
    const value = await patientSelect
      .locator("option", { hasText: "Configurações Um" })
      .getAttribute("value");
    expect(value).toBeTruthy();
    await patientSelect.selectOption(value as string);
    await page.getByRole("button", { name: "Gerar relatório de eliminação" }).click();
    await expect(page.getByText(/Resultado previsto/)).toBeVisible();

    await page.getByLabel(/Digite ELIMINAR PERMANENTEMENTE/).fill("frase errada");
    await page.getByRole("button", { name: "Eliminar dados identificadores" }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByText("A frase de confirmação não confere. Nada foi alterado.")).toBeVisible();
  });

  test("job de retenção rejeita CRON_SECRET inválido", async ({ request }) => {
    const response = await request.post("/api/jobs/audio-retention", {
      headers: { "x-cron-secret": "segredo-errado-e-comprido" },
      data: { source: "test" },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
