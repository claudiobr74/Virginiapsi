import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

async function fillRemainingPlaceholders(page: Page) {
  const textareas = page.locator("textarea:not([disabled])");
  const count = await textareas.count();
  for (let index = 0; index < count; index += 1) {
    const area = textareas.nth(index);
    const value = await area.inputValue();
    const next = value
      .replace(/\{\{[^}]+\}\}/g, "informação registrada pela profissional")
      .replace(/\[\[REVISAR:[^\]]*\]\]/g, "trecho desenvolvido na revisão");
    if (next !== value) {
      await area.fill(next);
    }
  }
}

async function confirmStudioIssue(page: Page, options?: { clinical?: boolean; certificate?: boolean; laudo?: boolean }) {
  await page.getByRole("button", { name: "Revisar e finalizar" }).click();
  await page.getByRole("button", { name: "Visualizar PDF" }).click();
  await expect(page.getByTitle("Pré-visualização do PDF")).toBeVisible();
  await page.getByLabel("Documento visualizado").check();
  if (options?.clinical !== false) {
    const review = page.getByLabel("Confirmo que revisei integralmente o documento.");
    if (await review.count()) {
      await review.check();
    }
    const purpose = page.getByLabel("Confirmo que o conteúdo está adequado à finalidade.");
    if (await purpose.count()) {
      await purpose.check();
    }
  }
  if (options?.certificate) {
    await page
      .getByLabel("Confirmo que existe fundamentação técnica suficiente para este Atestado Psicológico.")
      .check();
  }
  if (options?.laudo) {
    await page.getByLabel("Confirmo que houve avaliação psicológica compatível.").check();
  }
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Salvo agora")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Emitir documento" }).click();
  await expect(page.getByText("Emitido", { exact: true })).toBeVisible({ timeout: 20_000 });
}

test.describe("Estúdio de documentos", () => {
  test("declaração: gerar, preview, emitir PDF e registrar entrega", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents");
    await expect(page.getByRole("heading", { name: "Documentos" })).toBeVisible();
    await page.getByRole("link", { name: /Declaração/ }).first().click();
    await page.getByRole("button", { name: /Declaração de comparecimento/ }).click();
    await expect(page.getByText("modelo selecionado")).toBeVisible();
    await page.getByLabel(/Paciente/).selectOption({ label: "Documentos Dois — Documentos Dois Paciente" });
    await page.getByPlaceholder("Para que este documento será usado?").fill("comprovação de comparecimento junto à empresa");
    await page.getByRole("button", { name: "Criar documento" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await fillRemainingPlaceholders(page);
    await confirmStudioIssue(page, { clinical: true });
    await expect(page.getByRole("button", { name: "Baixar PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Registrar entrega" }).click();
    await page.getByPlaceholder("Destinatário").fill("Recursos humanos");
    await page.getByRole("button", { name: "Registrar entrega" }).last().click();
    await expect(page.getByText("Entrega registrada.")).toBeVisible();
  });

  test("relatório psicológico: editar, preview, revisar e emitir (IA opcional)", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents");
    await page.getByPlaceholder("Buscar um modelo...").fill("relatório para psiquiatra");
    await expect(page.getByRole("link", { name: /Relatório para psiquiatra/ })).toBeVisible();
    await page.goto("/app/documents/new?template=psychological_report_complete");
    await expect(page.getByText("modelo selecionado")).toBeVisible();
    await page.getByLabel(/Paciente/).selectOption({ label: "Documentos Tres — Documentos Tres Paciente" });
    await page.getByRole("button", { name: "+ Adicionar detalhes" }).click();
    await page.getByPlaceholder("Nome do destinatário, quando houver").fill("Dra. Destinatária");
    await page.getByPlaceholder("Para que este documento será usado?").fill("articulação com profissional de saúde");
    await page.getByRole("button", { name: "Criar documento" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await fillRemainingPlaceholders(page);
    await page.getByRole("button", { name: "Ajudar a escrever" }).click();
    const ack = page.getByLabel("Confirmo os dados acima como o único contexto enviado à IA.");
    if (await ack.count()) {
      await ack.check();
      await page.getByRole("button", { name: "Gerar rascunho" }).click();
      await expect(page.getByText(/Rascunho gerado|não pôde ser concluída|Consentimento/i)).toBeVisible({
        timeout: 15_000,
      });
    }
    await page.getByRole("button", { name: "Fechar" }).click();
    await confirmStudioIssue(page, { clinical: true });
  });

  test("contrato psicoterapêutico completo em livreto: preview multipágina e emissão", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents/new?template=psychotherapy_contract_complete");
    await page.getByLabel(/Paciente/).selectOption({ label: "Documentos Um — Documentos Um Paciente" });
    await page.getByRole("button", { name: "Opções do documento" }).click();
    await expect(page.getByLabel("Formato")).toHaveValue("livreto");
    await page.getByRole("button", { name: "+ Adicionar finalidade" }).click();
    await page.getByPlaceholder("Para que este documento será usado?").fill("início de acompanhamento psicológico");
    await page.getByRole("button", { name: "Criar documento" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Ajustes" }).click();
    await expect(page.getByLabel("Formato")).toHaveValue("livreto");
    await page.getByRole("button", { name: "Fechar" }).click();
    await fillRemainingPlaceholders(page);
    await confirmStudioIssue(page, { clinical: false });
  });

  test("parecer sem paciente: produzir e emitir", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/documents/new?template=psychological_opinion");
    await expect(page.getByLabel(/Paciente/)).toContainText("Sem paciente");
    await page.getByRole("button", { name: "+ Adicionar detalhes" }).click();
    await page.getByPlaceholder("Nome do destinatário, quando houver").fill("Instituição solicitante");
    await page.getByPlaceholder("Para que este documento será usado?").fill("resposta a quesito técnico");
    await page.getByRole("button", { name: "Criar documento" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: /Parecer psicológico/ })).toBeVisible();
    await fillRemainingPlaceholders(page);
    await confirmStudioIssue(page, { clinical: true });
    await expect(page.getByRole("button", { name: "Baixar PDF" })).toBeVisible();
  });
});
