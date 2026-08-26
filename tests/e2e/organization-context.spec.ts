import { expect, test, type Page } from "@playwright/test";
import {
  loginViaUi,
  newcomerCredentials,
  signIn,
  STUB_MULTI_ORG_USER,
  STUB_USER,
} from "./support/fixtures";

function isDesktopViewport(page: Page) {
  const size = page.viewportSize();
  return !size || size.width >= 1024;
}

/**
 * The organization context lives in the desktop sidebar and, on mobile, in
 * the "Mais" drawer — so the drawer has to be opened before asserting.
 */
async function openShellContext(page: Page) {
  if (!isDesktopViewport(page)) {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    return page.getByRole("dialog");
  }
  return page.getByRole("navigation", { name: "Navegação principal" }).locator("..");
}

test.describe("Contexto de organização", () => {
  test("usuário com uma organização entra direto no shell e vê o contexto", async ({
    page,
  }) => {
    await loginViaUi(page);
    const context = await openShellContext(page);

    await expect(
      context.getByText(STUB_USER.organizationName).first(),
    ).toBeVisible();
    await expect(
      context.getByText("Administradora").first(),
    ).toBeVisible();
    // Com um único consultório, não há troca de contexto para oferecer.
    await expect(
      context.getByRole("link", { name: "Trocar consultório" }),
    ).toHaveCount(0);
  });

  test("usuário sem organização é levado ao onboarding e aguarda convite", async ({
    page,
  }) => {
    await signIn(page, newcomerCredentials());
    await page.waitForURL("**/onboarding");

    await expect(
      page.getByRole("heading", { name: "Aguardando convite" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar consultório" })).toHaveCount(0);
  });

  test("usuário com múltiplas organizações precisa escolher explicitamente", async ({
    page,
  }) => {
    await signIn(page, STUB_MULTI_ORG_USER);
    await page.waitForURL("**/select-organization");

    await expect(
      page.getByRole("heading", { name: "Escolha o consultório" }),
    ).toBeVisible();
    for (const organization of STUB_MULTI_ORG_USER.organizations) {
      await expect(page.getByText(organization)).toBeVisible();
    }

    await page.getByRole("button", { name: "Entrar" }).first().click();

    await page.waitForURL("**/app");
    const context = await openShellContext(page);
    await expect(
      context.getByRole("link", { name: "Trocar consultório" }).first(),
    ).toBeVisible();
  });

  test("cookie de organização inválido não concede acesso a outro tenant", async ({
    page,
    context: browserContext,
  }) => {
    await loginViaUi(page);

    await browserContext.addCookies([
      {
        name: "tesseli-active-organization",
        value: "11111111-1111-4111-8111-999999999999",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);

    await page.goto("/app");

    // O cookie é apenas contexto de navegação: como não corresponde a nenhuma
    // membership, o app cai de volta na única organização legítima.
    await expect(page).toHaveURL(/\/app$/);
    const shell = await openShellContext(page);
    await expect(
      shell.getByText(STUB_USER.organizationName).first(),
    ).toBeVisible();
  });
});

test.describe("Sessão forjada", () => {
  test("cookie de sessão inválido não passa pelo gate de autenticação", async ({
    page,
    context,
  }) => {
    // Um cookie de sessão fabricado (nunca emitido pelo servidor de auth) não
    // pode virar sessão: o app valida sempre pelo caminho real do Supabase
    // (auth.getUser()), nunca por decode local do token.
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: "base64-eyJhY2Nlc3NfdG9rZW4iOiJmb3JnZWQiLCJ1c2VyIjp7ImlkIjoiMSJ9fQ",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", {
        name: "Tudo o que você precisa para cuidar dos seus pacientes.",
      }),
    ).toBeVisible();
  });
});
