import { expect, type Page } from "@playwright/test";

/** Completes the multi-step session close wizard without extra scheduling. */
export async function completeFinalizeWizard(
  page: Page,
  options: { registerCharge?: boolean } = {},
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Finalizar", exact: true }).click();
  await expect(dialog.getByText("Deseja agendar o próximo encontro?")).toBeVisible();
  await dialog.getByRole("button", { name: "Depois" }).click();

  const register = dialog.getByRole("button", { name: "Registrar cobrança" });
  if ((await register.count()) > 0) {
    if (options.registerCharge) {
      await register.click();
    } else {
      await dialog.getByRole("button", { name: "Não registrar agora" }).click();
    }
  }

  await expect(dialog.getByText("sessão finalizada")).toBeVisible();
  await dialog.getByRole("button", { name: "Concluir" }).click();
}
