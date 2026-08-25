import { expect, test } from "@playwright/test";

test.describe("Root e gate de sessão", () => {
  test("raiz sem sessão redireciona para /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("acessar /app sem sessão redireciona para /login preservando next", async ({
    page,
  }) => {
    await page.goto("/app/patients");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fpatients$/);
  });
});

test.describe("Login", () => {
  test("renderiza marca, formulário e aviso de segurança", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("img", { name: "VirgíniaPsi" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Tudo o que você precisa para cuidar dos seus pacientes.",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continuar com Google" }),
    ).toBeVisible();
    await expect(page.getByText(/LGPD/)).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("mostra aviso quando o callback do Google falha", async ({ page }) => {
    await page.goto("/login?error=auth_callback_failed");

    await expect(page.getByRole("alert")).toContainText(
      "Não foi possível concluir o login com Google",
    );
  });

  test("mostra erros de validação com campos vazios", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Informe seu e-mail.")).toBeVisible();
    await expect(page.getByText("Informe sua senha.")).toBeVisible();
  });

  test("link 'Esqueci minha senha' navega para a recuperação", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/auth\/recovery$/);
    await expect(
      page.getByRole("heading", { name: "Recuperar senha" }),
    ).toBeVisible();
  });

  test("link 'Criar conta' abre o cadastro sem criar clínica", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Criar conta" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await expect(
      page.getByText(/O cadastro não cria um consultório/),
    ).toBeVisible();
  });
});

test.describe("Login — dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("aplica o tema escuro por padrão", async ({ page }) => {
    await page.goto("/login");
    const backgroundColor = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    // #131412 -> rgb(19, 20, 18)
    expect(backgroundColor).toBe("rgb(19, 20, 18)");
  });
});

test.describe("Recuperação de senha", () => {
  test("valida e-mail e sempre confirma sem revelar existência da conta", async ({
    page,
  }) => {
    await page.goto("/auth/recovery");

    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();
    await expect(page.getByText("Informe seu e-mail.")).toBeVisible();

    await page.getByLabel("E-mail").fill("qualquer-pessoa@example.com");
    await page.getByRole("button", { name: "Enviar link de recuperação" }).click();

    await expect(
      page.getByText(
        "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.",
      ),
    ).toBeVisible();
  });
});

test.describe("Redefinir senha sem link válido", () => {
  test("mostra estado de link expirado quando não há sessão de recuperação", async ({
    page,
  }) => {
    await page.goto("/auth/update-password");
    await expect(
      page.getByText("Este link de recuperação expirou ou já foi usado."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Solicitar novo link" }),
    ).toBeVisible();
  });
});
