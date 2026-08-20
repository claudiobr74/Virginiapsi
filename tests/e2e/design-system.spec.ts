import { expect, test } from "@playwright/test";

test.describe("Design system — referência mínima", () => {
  test("lista os onze primitivos canônicos e permite interação", async ({
    page,
  }) => {
    await page.goto("/design-system");

    await expect(
      page.getByRole("heading", { name: "Design System Tesseli" }),
    ).toBeVisible();

    for (const title of [
      "Button",
      "StatusBadge",
      "SectionHeader",
      "SearchField",
      "EmptyState",
      "LoadingState",
      "Modal",
      "Drawer",
      "ConfirmDialog",
      "PageContainer / PageHeader",
    ]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("Modal abre e fecha", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Abrir modal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Título do modal" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Drawer abre do lado direito e fecha", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Abrir drawer" }).click();
    await expect(
      page.getByRole("heading", { name: "Detalhes" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(
      page.getByRole("heading", { name: "Detalhes" }),
    ).toBeHidden();
  });

  test("ConfirmDialog pede confirmação antes de uma ação destrutiva", async ({
    page,
  }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Excluir registro" }).click();
    await expect(
      page.getByRole("heading", { name: "Excluir registro?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(
      page.getByRole("heading", { name: "Excluir registro?" }),
    ).toBeHidden();
  });
});
