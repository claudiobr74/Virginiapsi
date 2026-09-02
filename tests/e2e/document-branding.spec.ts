import { expect, test, type Page } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";
import path from "node:path";
import { mkdirSync } from "node:fs";

const ARTIFACTS = path.join(process.cwd(), "artifacts", "document-branding-v2");

async function openDocumentsTab(page: Page) {
  await page.goto("/app/settings");
  await page.getByRole("tab", { name: "Documentos" }).click();
  await expect(page.getByRole("heading", { name: "Identidade visual dos documentos" })).toBeVisible();
}

test.describe("Identidade visual dos documentos", () => {
  test("salva Minimalista e Clínico com roundtrip após reload", async ({ page }, testInfo) => {
    mkdirSync(ARTIFACTS, { recursive: true });
    await loginViaUi(page);
    await openDocumentsTab(page);

    await expect(page.getByRole("radiogroup", { name: "Estilo visual dos documentos" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Opções avançadas/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.getByText("defaultVisualProfile")).toHaveCount(0);

    await page.getByRole("radio", { name: /Clínico/ }).click();
    await page.getByRole("button", { name: "Salvar identidade visual" }).click();
    await expect(page.getByText(/Identidade visual salva/)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByRole("radio", { name: /Clínico/ })).toHaveAttribute("aria-checked", "true");

    if (testInfo.project.name === "desktop-chromium") {
      await page.screenshot({
        path: path.join(ARTIFACTS, "desktop-1440-clinico.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.screenshot({
        path: path.join(ARTIFACTS, "tablet-768-clinico.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: "Ver prévia" }).click();
      await expect(page.getByRole("dialog").getByTestId("branding-a4-page")).toBeVisible();
      await page.screenshot({
        path: path.join(ARTIFACTS, "mobile-390-preview.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Fechar" }).click();
      await page.screenshot({
        path: path.join(ARTIFACTS, "mobile-390-clinico.png"),
        fullPage: true,
      });
    }

    await page.getByRole("radio", { name: /Minimalista/ }).click();
    await expect(page.getByRole("radio", { name: /Minimalista/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Alterações não salvas")).toBeVisible();
    if (testInfo.project.name === "desktop-chromium") {
      await page.screenshot({
        path: path.join(ARTIFACTS, "desktop-1440-minimalista.png"),
        fullPage: true,
      });
    }

    await page.getByRole("button", { name: "Salvar identidade visual" }).click();
    await expect(page.getByText(/Identidade visual salva/)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByRole("radio", { name: /Minimalista/ })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: /Clínico/ }).click();
    await page.getByRole("button", { name: "Salvar identidade visual" }).click();
    await expect(page.getByText(/Identidade visual salva/)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByRole("radio", { name: /Clínico/ })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: /Elegante/ }).click();
    await page.getByRole("button", { name: "Salvar identidade visual" }).click();
    await expect(page.getByText(/Identidade visual salva/)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByRole("radio", { name: /Elegante/ })).toHaveAttribute("aria-checked", "true");
  });

  test("prévia ao vivo e reload descarta alteração não salva", async ({ page }) => {
    await loginViaUi(page);
    await openDocumentsTab(page);
    await page.getByRole("radio", { name: /Institucional/ }).click();
    await expect(page.getByText("Alterações não salvas")).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByRole("radio", { name: /Institucional/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("documento novo herda o modelo salvo", async ({ page }) => {
    await loginViaUi(page);
    await openDocumentsTab(page);
    await page.getByRole("radio", { name: /Elegante/ }).click();
    await page.getByRole("button", { name: "Salvar identidade visual" }).click();
    await expect(page.getByText(/Identidade visual salva/)).toBeVisible();

    await page.goto("/app/documents/new?template=declaration_attendance");
    await expect(page.getByText("modelo selecionado")).toBeVisible();
    await page.getByLabel(/Paciente/).selectOption({ index: 1 });
    const purpose = page.getByPlaceholder("Para que este documento será usado?");
    if (await purpose.count()) {
      await purpose.fill("comprovação de comparecimento");
    }
    await page.getByRole("button", { name: "Criar documento" }).click();
    await page.waitForURL(/\/app\/documents\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Ajustes" }).click();
    await expect(page.getByLabel("Perfil visual")).toHaveValue("premium");
  });
});
