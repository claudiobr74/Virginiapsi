import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, newcomerCredentials, signIn } from "./support/fixtures";

const PASTEL = {
  cream: "#fbf9f6",
  sage: "#eef5ef",
  lavender: "#f4f0fa",
  peach: "#fff2ea",
  mist: "#eef5fb",
} as const;

async function assertTransparentLogo(page: Page, root?: ReturnType<Page["locator"]>) {
  const scope = root ?? page.locator("body");
  const surface = scope.locator(".brand-surface").first();
  const mark = scope.locator(".brand-mark").first();
  await expect(surface).toBeVisible();
  await expect(mark).toBeVisible();
  await expect(mark).toHaveCSS("mix-blend-mode", "normal");
  const background = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background === "rgba(0, 0, 0, 0)" || background === "transparent").toBe(true);
}

test.describe("Logo transparente", () => {
  test("login, signup e recovery sem blend nem placa cream", async ({ page }, testInfo) => {
    for (const href of ["/login", "/signup", "/auth/recovery"]) {
      await page.goto(href);
      await expect(page.getByRole("img", { name: "VirgíniaPsi" })).toBeVisible();
      await assertTransparentLogo(page);
    }

    if (testInfo.project.name === "desktop-chromium") {
      await page.goto("/login");
      for (const [name, color] of Object.entries(PASTEL)) {
        await page.evaluate((bg) => {
          document.documentElement.style.background = bg;
          document.body.style.background = bg;
        }, color);
        await page.screenshot({
          path: `test-results/logo-${name}-${testInfo.project.name}.png`,
          fullPage: false,
        });
      }
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.background = "";
        document.body.style.background = "";
      });
      await assertTransparentLogo(page);
      await page.screenshot({
        path: `test-results/logo-dark-${testInfo.project.name}.png`,
        fullPage: false,
      });
    }
  });

  test("onboarding de quem ainda não tem consultório", async ({ page }) => {
    await signIn(page, newcomerCredentials());
    await page.waitForURL("**/onboarding");
    await expect(page.getByRole("img", { name: "VirgíniaPsi" })).toBeVisible();
    await assertTransparentLogo(page);
  });

  test("sidebar desktop, header mobile e lock screen", async ({ page }) => {
    await loginViaUi(page);
    await assertTransparentLogo(page);

    const viewport = page.viewportSize();
    if ((viewport?.width ?? 0) >= 1024) {
      await page.getByRole("button", { name: "Bloquear tela" }).click();
    } else {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Bloquear tela" }).click();
    }

    const lockScreen = page.getByRole("dialog", { name: "Tela bloqueada" });
    await expect(lockScreen).toBeVisible();
    await assertTransparentLogo(page, lockScreen);
  });
});
