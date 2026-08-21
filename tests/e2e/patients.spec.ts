import { expect, test } from "@playwright/test";
import { loginViaUi, signIn, STUB_SECRETARY } from "./support/fixtures";

test.describe("Lista de pacientes", () => {
  test("renderiza o paciente seedado com código, contato e situação", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/patients");
    const patientRow = page.getByRole("link", { name: /Beatriz/ });
    await expect(patientRow).toBeVisible();
    await expect(patientRow.getByText("PAC-001")).toBeVisible();
    await expect(patientRow.getByText("Ativo", { exact: true })).toBeVisible();
  });

  test("busca filtra a lista por nome", async ({ page }) => {
    await loginViaUi(page);
    await page.goto("/app/patients");

    await page
      .getByRole("searchbox")
      .fill("Beatriz");
    await page.waitForURL(/search=Beatriz/);
    await expect(page.getByText("Beatriz", { exact: true })).toBeVisible();

    await page.getByRole("searchbox").fill("Inexistente");
    await page.waitForURL(/search=Inexistente/);
    await expect(page.getByText("Nenhum paciente encontrado")).toBeVisible();
  });
});

test.describe("Cadastro de paciente", () => {
  test("formulário de 4 seções cria um paciente e abre o Patient Hub", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/patients/new");

    await expect(
      page.getByRole("heading", { name: "Identificação" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar foto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tirar foto" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contato & Responsáveis" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Atendimento & Situação" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Financeiro & Termos" }),
    ).toBeVisible();
    await expect(
      page.getByText("Templates de TCLE e consentimentos chegam nas fases 5.5 e 9."),
    ).toHaveCount(0);
    await expect(
      page.getByText("Termos de serviço e TCLE são registrados no prontuário depois do cadastro."),
    ).toBeVisible();

    await page.getByLabel("Nome preferencial").fill("Carla Teste");
    await page.getByLabel("Nome completo").fill("Carla Teste da Silva");
    await page.getByLabel("Telefone").fill("11977776666");
    await page.getByLabel("E-mail").fill("carla@example.com");

    await page.getByRole("button", { name: "Adicionar responsável" }).click();
    await page.getByLabel("Nome do responsável").fill("Marta Teste");
    await page.getByLabel("Vínculo").fill("Mãe");
    await page.getByLabel("Telefone do responsável").fill("11966665555");

    await page.getByText("Online", { exact: true }).click();
    await page.getByLabel(/Valor padrão da sessão/).fill("250");

    await page.getByRole("button", { name: "Cadastrar paciente" }).click();

    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Carla Teste" })).toBeVisible();
    await expect(page.getByText(/PAC-\d{3,}/)).toBeVisible();
    await expect(page.getByText("Marta Teste", { exact: true })).toBeVisible();
    await expect(page.getByText("R$ 250,00")).toBeVisible();
  });

  test("edição mostra a situação dos termos em vez do placeholder de fase", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/patients");
    await page.getByText("Beatriz", { exact: true }).click();
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+$/);
    await page.getByRole("link", { name: "Editar cadastro" }).click();
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+\/edit$/);

    await expect(
      page.getByRole("heading", { name: "Financeiro & Termos" }),
    ).toBeVisible();
    await expect(
      page.getByText("Templates de TCLE e consentimentos chegam nas fases 5.5 e 9."),
    ).toHaveCount(0);
    await expect(page.getByText("Termos de Serviço")).toBeVisible();
    await expect(page.getByText("TCLE de Psicoterapia")).toBeVisible();
    await expect(page.getByText("Não aceito").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Abrir termos no prontuário" }),
    ).toHaveAttribute("href", /\/app\/patients\/[0-9a-f-]+\?tab=tcle#tcle$/);
  });

  test("envia foto de identificação no cadastro e mostra no prontuário", async ({
    page,
  }) => {
    await loginViaUi(page);
    await page.goto("/app/patients/new");

    await page.getByLabel("Nome preferencial").fill("Foto Teste");
    await page.getByLabel("Nome completo").fill("Foto Teste da Silva");

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
    await expect(page.getByRole("img", { name: "Foto de Paciente" })).toBeVisible();

    await page.getByRole("button", { name: "Cadastrar paciente" }).click();
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Foto Teste" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Foto de Foto Teste" })).toBeVisible();
  });
});

test.describe("Patient Hub — isolamento clínico", () => {
  test("admin vê e edita o Acompanhamento clínico", async ({ page }) => {
    await loginViaUi(page);

    // Paciente próprio deste teste — não depende do seed compartilhado
    // ("Beatriz"), que outros testes/projetos podem ler ao mesmo tempo.
    await page.goto("/app/patients/new");
    await page.getByLabel("Nome preferencial").fill("Fernanda Perfil");
    await page.getByLabel("Nome completo").fill("Fernanda Perfil Teste");
    await page.getByRole("button", { name: "Cadastrar paciente" }).click();
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+$/);

    await expect(
      page.getByRole("heading", { name: "Acompanhamento", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Queixa principal")).toHaveValue("");

    await page
      .getByLabel("Queixa principal")
      .fill("Ansiedade relacionada ao trabalho");
    await page.getByRole("button", { name: "Salvar acompanhamento" }).click();
    await expect(page.getByText("Acompanhamento clínico salvo.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Queixa principal")).toHaveValue(
      "Ansiedade relacionada ao trabalho",
    );
  });

  test("secretária não recebe nem renderiza conteúdo clínico do paciente", async ({
    page,
  }) => {
    const clinicalResponses: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("patient_clinical_profile")) {
        clinicalResponses.push(response.url());
      }
    });

    await signIn(page, STUB_SECRETARY);
    await page.waitForURL("**/app");

    await page.goto("/app/patients");
    await expect(page.getByText("Beatriz", { exact: true })).toBeVisible();
    await page.getByText("Beatriz", { exact: true }).click();

    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Beatriz" })).toBeVisible();

    // A seção clínica não existe no DOM para a secretaria — não é apenas
    // escondida por CSS — e nenhuma chamada de rede busca o perfil clínico.
    // "Queixa principal" é o rótulo do campo (estático, independe do
    // conteúdo), então é uma prova robusta mesmo que outro teste concorrente
    // altere o texto clínico da Beatriz nesse instante.
    await expect(
      page.getByRole("heading", { name: "Acompanhamento" }),
    ).toHaveCount(0);
    await expect(page.getByText("Queixa principal")).toHaveCount(0);
    expect(clinicalResponses).toEqual([]);
  });
});

test.describe("Arquivamento de paciente", () => {
  test("exige confirmação antes de arquivar", async ({ page }) => {
    await loginViaUi(page);

    // Paciente próprio deste teste, para não mutar o estado do seed
    // compartilhado ("Beatriz") usado pelos demais testes em paralelo.
    await page.goto("/app/patients/new");
    await page.getByLabel("Nome preferencial").fill("Paciente Arquivável");
    await page.getByLabel("Nome completo").fill("Paciente Arquivável Teste");
    await page.getByRole("button", { name: "Cadastrar paciente" }).click();
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: "Alterar situação" }).click();
    await page.getByRole("button", { name: "Arquivado" }).click();

    await expect(
      page.getByRole("heading", { name: "Arquivar paciente?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Arquivar" }).click();

    await expect(page.getByText("Arquivado").first()).toBeVisible();
  });
});
