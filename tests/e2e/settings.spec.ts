import { expect, test } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

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

  test("admin vê Documentos, Integrações e diagnósticos sem secrets", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/settings");

    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    for (const label of [
      "Meu Perfil",
      "Consultório",
      "Documentos",
      "Aparência",
      "Segurança",
      "Equipe e Acessos",
      "Integrações",
      "Backup e Recuperação",
      "Zona de Risco",
    ]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }

    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(
      page.getByRole("heading", { name: "Identidade visual dos documentos" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Integrações" }).click();
    await expect(page.getByRole("heading", { name: "Google Agenda" })).toBeVisible();
    await expect(page.getByText("Status", { exact: true })).toBeVisible();
    await expect(page.getByText("Não conectado")).toBeVisible();
    await expect(
      page.getByText("Conecte uma conta Google para sincronizar seus compromissos."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Conectar Google Agenda" }),
    ).toBeVisible();
    await expect(page.getByText("Conta Google:")).toHaveCount(0);
    await expect(page.getByText(/última sincronização/i)).toHaveCount(0);
    await expect(page.getByText(/cadastre este endereço/i)).toHaveCount(0);
    await expect(page.getByText(/api\/integrations\/google\/callback/)).toHaveCount(0);
    await expect(page.getByText("Twilio WhatsApp")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Transcrição", exact: true })).toBeVisible();
    await expect(page.getByText("Gemini")).toBeVisible();
    await expect(
      page.getByText(/Transcrição em tempo real via Groq|Chave Groq ausente/),
    ).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(new RegExp(["TWILIO", "AUTH", "TOKEN"].join("_")));
    expect(body).not.toMatch(new RegExp(["GEMINI", "API", "KEY"].join("_")));
    expect(body).not.toMatch(new RegExp(["CRON", "SECRET"].join("_")));
    expect(body).not.toMatch(new RegExp(["sb", "secret", ""].join("_")));
    expect(body).not.toMatch(new RegExp(["SUPABASE", "SECRET", "KEY"].join("_")));
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

  test("admin envia foto profissional e vê no Meu Dia junto ao nome", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/settings");
    await page.getByRole("tab", { name: "Meu Perfil" }).click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Enviar foto" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "retrato.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(page.getByText("Foto profissional atualizada.")).toBeVisible();
    await expect(page.getByRole("img", { name: /Foto de / })).toBeVisible();

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /Ana Serena/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Foto de Ana Serena/ })).toBeVisible();
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

  test("admin separa CPF e CNPJ no consultório e vê a citação diária", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/settings");
    await page.getByRole("tab", { name: "Consultório" }).click();

    await expect(page.getByText("CPF/CNPJ")).toHaveCount(0);
    await page.getByLabel("CPF profissional").fill("529.982.247-25");
    await page.getByLabel("CNPJ do consultório").fill("11.222.333/0001-81");
    await page.getByRole("button", { name: "Salvar consultório" }).click();
    await expect(page.getByText("Consultório atualizado.")).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Consultório" }).click();
    await expect(page.getByLabel("CPF profissional")).toHaveValue("529.982.247-25");
    await expect(page.getByLabel("CNPJ do consultório")).toHaveValue("11.222.333/0001-81");

    await page.getByLabel("CPF profissional").fill("111.111.111-11");
    await page.getByRole("button", { name: "Salvar consultório" }).click();
    await expect(page.getByText("CPF inválido.")).toBeVisible();

    await page.getByRole("tab", { name: "Aparência" }).click();
    await expect(page.getByRole("radio", { name: /Rotação automática/ })).toBeChecked();
    await expect(page.getByText("Citação de hoje")).toBeVisible();
    await page.getByRole("button", { name: "Ver banco de 30 citações" }).click();
    await expect(page.getByRole("heading", { name: "Banco de citações" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("listitem").first()).toContainText(
      "Escutar com presença é abrir espaço para que o outro também se escute.",
    );
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.getByRole("radio", { name: /Personalizada/ }).click();
    await page.getByLabel("Citação personalizada").fill("texto guardado da clínica");
    await page.getByRole("button", { name: "Salvar aparência" }).click();
    await expect(page.getByText("Aparência atualizada.")).toBeVisible();

    await page.getByRole("radio", { name: /Rotação automática/ }).click();
    await page.getByRole("button", { name: "Salvar aparência" }).click();
    await expect(page.getByText("Aparência atualizada.")).toBeVisible();
    await page.getByRole("radio", { name: /Personalizada/ }).click();
    await expect(page.getByLabel("Citação personalizada")).toHaveValue(
      "texto guardado da clínica",
    );
  });

  test("job de retenção rejeita credencial inválida", async ({ request }) => {
    const response = await request.post("/api/jobs/audio-retention", {
      headers: { "x-cron-secret": "invalid-test-value" },
      data: { source: "test" },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
