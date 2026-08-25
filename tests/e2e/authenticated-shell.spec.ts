import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, STUB_USER } from "./support/fixtures";

function isDesktopViewport(page: Page) {
  const size = page.viewportSize();
  return !size || size.width >= 1024;
}

async function openNavItem(page: Page, label: string) {
  if (isDesktopViewport(page)) {
    await page
      .getByRole("navigation", { name: "Navegação principal" })
      .getByRole("link", { name: label, exact: true })
      .click();
    return;
  }

  const bottomNavLink = page.getByRole("navigation", {
    name: "Navegação inferior",
  }).getByRole("link", { name: label, exact: true });

  if (await bottomNavLink.count()) {
    await bottomNavLink.click();
    return;
  }

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: label, exact: true }).click();
}

test.describe("Login autenticado", () => {
  test("credenciais válidas redirecionam para /app e mostram o shell", async ({
    page,
  }) => {
    await loginViaUi(page);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: /Ana Serena/ })).toBeVisible();

    if (isDesktopViewport(page)) {
      await expect(
        page
          .getByRole("navigation", { name: "Navegação principal" })
          .getByRole("link", { name: "Pacientes", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(STUB_USER.displayName).first()).toBeVisible();
    } else {
      await expect(
        page.getByRole("navigation", { name: "Navegação inferior" }),
      ).toBeVisible();
    }
  });

  test("credenciais inválidas mostram erro genérico e permanecem em /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(STUB_USER.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(
      page.getByText("E-mail ou senha inválidos. Verifique os dados e tente novamente."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Navegação entre módulos", () => {
  test("abre o Financeiro a partir da navegação", async ({
    page,
  }) => {
    await loginViaUi(page);
    await openNavItem(page, "Financeiro");

    await expect(page).toHaveURL(/\/app\/finance$/);
    await expect(
      page.getByRole("heading", { name: "Financeiro" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Hoje" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Recebimentos" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Despesas" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Relatórios" })).toBeVisible();
  });

  test("abre Pendências, Sessões e Indicadores a partir da navegação", async ({
    page,
  }) => {
    await loginViaUi(page);
    await openNavItem(page, "Pendências");
    await expect(page).toHaveURL(/\/app\/pendencias$/);
    await expect(
      page.getByRole("heading", { name: "Central de Pendências Inteligente" }),
    ).toBeVisible();

    await openNavItem(page, "Sessões");
    await expect(page).toHaveURL(/\/app\/sessions$/);
    await expect(page.getByRole("heading", { name: "Sessões" })).toBeVisible();

    await openNavItem(page, "Indicadores");
    await expect(page).toHaveURL(/\/app\/indicadores$/);
    await expect(
      page.getByRole("heading", { name: "Indicadores e Métricas Clínicas" }),
    ).toBeVisible();
  });
});

test.describe("Bloqueio de tela", () => {
  test("bloqueio manual exige senha correta para desbloquear", async ({
    page,
  }) => {
    await loginViaUi(page);

    if (isDesktopViewport(page)) {
      await page.getByRole("button", { name: "Bloquear tela" }).click();
    } else {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Bloquear tela" }).click();
    }

    const lockScreen = page.getByRole("dialog", { name: "Tela bloqueada" });
    await expect(lockScreen).toBeVisible();
    await expect(lockScreen.getByText(STUB_USER.email)).toBeVisible();

    await lockScreen.getByLabel("Senha").fill("senha-errada");
    await lockScreen.getByRole("button", { name: "Desbloquear" }).click();
    await expect(
      lockScreen.getByText("E-mail ou senha inválidos. Verifique os dados e tente novamente."),
    ).toBeVisible();
    await expect(lockScreen).toBeVisible();

    await lockScreen.getByLabel("Senha").fill(STUB_USER.password);
    await lockScreen.getByRole("button", { name: "Desbloquear" }).click();
    await expect(lockScreen).toBeHidden();
  });
});

test.describe("Logout", () => {
  test("exige confirmação e redireciona para /login", async ({ page }) => {
    await loginViaUi(page);

    if (isDesktopViewport(page)) {
      await page.getByRole("button", { name: "Sair" }).click();
    } else {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Sair" }).click();
    }

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Sair" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Tema", () => {
  test("alterna e persiste entre claro e escuro", async ({ page }) => {
    await loginViaUi(page);

    let themeToggle = page.getByRole("button", { name: /Ativar tema/ });
    if (!isDesktopViewport(page)) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      themeToggle = page
        .getByRole("dialog")
        .getByRole("button", { name: /Ativar tema/ });
    }
    await themeToggle.click();

    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
