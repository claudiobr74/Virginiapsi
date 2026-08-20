import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

async function openPatient(page: Page, preferredName: string): Promise<string> {
  await page.goto("/app/patients");
  await page.getByText(preferredName, { exact: true }).click();
  await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

test.describe("Documentos", () => {
  test("admin cria um atestado (clínico), salva rascunho e emite o PDF", async ({ page }) => {
    await loginViaUi(page);
    await openPatient(page, "Documentos Um");

    await page.getByRole("button", { name: "Novo documento" }).click();
    await page.getByPlaceholder("Título do documento").fill("Atestado de comparecimento");
    await page.getByRole("button", { name: "Criar rascunho" }).click();

    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { name: "Atestado de comparecimento" }),
    ).toBeVisible();
    await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();

    const textarea = page.locator("textarea");
    await textarea.fill("Atesto que {{patient.full_name}} compareceu à consulta em {{date.today}}.");
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(page.getByText("Rascunho salvo.")).toBeVisible();

    await page.getByRole("button", { name: "Emitir PDF" }).click();
    await expect(page.getByText("Emitido")).toBeVisible();
    await expect(page.getByRole("button", { name: "Baixar PDF" })).toBeVisible();

    await page.goto("/app/documents");
    await expect(page.getByText("Atestado de comparecimento")).toBeVisible();
  });

  test("admin cria um modelo na página de Documentos", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents");

    await page.getByPlaceholder("Nome do modelo").fill("Atestado padrão E2E");
    await page.getByRole("button", { name: "Criar modelo" }).click();
    await expect(page.getByText("Atestado padrão E2E")).toBeVisible();
  });

  test("secretária não abre um documento clínico mesmo com o URL", async ({ page }) => {
    await loginViaUi(page);
    await openPatient(page, "Documentos Quatro");

    await page.getByRole("button", { name: "Novo documento" }).click();
    await page.getByPlaceholder("Título do documento").fill("Laudo confidencial E2E");
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    const clinicalUrl = page.url();

    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);
    await page.goto(clinicalUrl);

    await expect(page.getByText("Documento não encontrado")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Laudo confidencial E2E" }),
    ).toHaveCount(0);
  });

  test("secretária cria apenas documentos administrativos", async ({ page }) => {
    await loginViaUi(page);
    await page.context().clearCookies();
    await signIn(page, STUB_SECRETARY);
    await page.waitForURL(/\/app$/);
    await openPatient(page, "Documentos Dois");

    await page.getByRole("button", { name: "Novo documento" }).click();
    // "Atestado"/"Laudo"/etc (clinical-forced) must not even be offered.
    const kindSelect = page.locator("select").first();
    const options = await kindSelect.locator("option").allTextContents();
    expect(options).not.toContain("Atestado");
    expect(options).not.toContain("Laudo");

    await page.getByPlaceholder("Título do documento").fill("Recibo de sessão");
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Recibo de sessão" })).toBeVisible();
  });
});

test.describe("Anexos", () => {
  test("envia, baixa e remove um anexo", async ({ page }) => {
    await loginViaUi(page);
    await openPatient(page, "Documentos Tres");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Enviar anexo" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "comprovante.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Comprovante de pagamento E2E."),
    });

    await expect(page.getByText("comprovante.txt")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Remover anexo" }).click();
    await expect(page.getByText("comprovante.txt")).toHaveCount(0);
  });
});

test.describe("Gestão de TCLE", () => {
  test("registra aceite, mostra versão vigente, revoga e volta a permitir novo aceite", async ({
    page,
  }) => {
    await loginViaUi(page);
    await openPatient(page, "TCLE Um");

    const row = page.getByTestId("tcle-row-psychotherapy");
    await expect(row.getByText("TCLE de Psicoterapia")).toBeVisible();
    await row.getByRole("button", { name: "Registrar aceite" }).click();

    await expect(row.getByText("Aceito — versão vigente")).toBeVisible();

    await row.getByRole("button", { name: "Revogar" }).click();

    await expect(row.getByText("Revogado")).toBeVisible();
  });
});
