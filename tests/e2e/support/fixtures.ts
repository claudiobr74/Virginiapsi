import type { Page } from "@playwright/test";

export const STUB_USER = {
  email: "psicologa@serenapsi.test",
  password: "SerenaPsi#2026",
  displayName: "Ana Serena",
};

export async function loginViaUi(page: Page, target = "/app") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(STUB_USER.email);
  await page.getByLabel("Senha", { exact: true }).fill(STUB_USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`**${target}`);
}
