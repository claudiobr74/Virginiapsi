import type { Page } from "@playwright/test";

const PASSWORD = "SerenaPsi#2026";

/** Admin of a single organization — lands straight in the shell. */
export const STUB_USER = {
  email: "psicologa@serenapsi.test",
  password: PASSWORD,
  displayName: "Ana Serena",
  organizationName: "Consultório Serena",
};

/**
 * Fresh account with no membership, created on demand by the stub so each
 * onboarding test is isolated from the others.
 */
export function newcomerCredentials() {
  const id = Math.random().toString(36).slice(2, 10);
  return { email: `novo-${id}@serenapsi.test`, password: PASSWORD };
}

/** Member of two organizations — must pick one explicitly. */
export const STUB_MULTI_ORG_USER = {
  email: "multi@serenapsi.test",
  password: PASSWORD,
  organizations: ["Clínica Aurora", "Espaço Bem-Viver"],
};

export async function signIn(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function loginViaUi(page: Page, target = "/app") {
  await signIn(page, STUB_USER);
  await page.waitForURL(`**${target}`);
}
