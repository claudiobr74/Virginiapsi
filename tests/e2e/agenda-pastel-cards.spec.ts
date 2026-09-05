import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";

const OUT = path.join(process.cwd(), "artifacts/agenda-pastel");

const PASTEL = {
  active: "rgb(234, 246, 237)",
  completed: "rgb(237, 244, 252)",
  cancelled: "rgb(252, 238, 238)",
} as const;

function shotName(label: string, testInfo: { project: { name: string } }) {
  const viewport = testInfo.project.name === "mobile-chromium" ? "390x844" : "1440x900";
  return path.join(OUT, `${label}-${viewport}.png`);
}

test.describe("Agenda Pastel — regressão visual", () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test("Agenda: verde, azul e vermelho pastel", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await loginViaUi(page);
    await page.goto("/app/agenda");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();

    const active = page.locator("[data-appointment-visual='active']").first();
    const completed = page.locator("[data-appointment-visual='completed']").first();
    const cancelled = page.locator("[data-appointment-visual='cancelled']").first();

    await expect(active).toBeVisible();
    await expect(completed).toBeVisible();
    await expect(cancelled).toBeVisible();
    await expect(active).toHaveCSS("background-color", PASTEL.active);
    await expect(completed).toHaveCSS("background-color", PASTEL.completed);
    await expect(cancelled).toHaveCSS("background-color", PASTEL.cancelled);

    await page.screenshot({ path: shotName("agenda", testInfo), fullPage: true });
  });

  test("Meu Dia: timeline e Próxima Sessão pastel", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await loginViaUi(page);
    await page.goto("/app");

    const nextCard = page.locator("section[data-appointment-visual]").first();
    await expect(page.getByText("Próxima sessão").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agenda de Hoje" })).toBeVisible();

    const active = page.locator("[data-appointment-visual='active']").first();
    const completed = page.locator("[data-appointment-visual='completed']").first();
    const cancelled = page.locator("[data-appointment-visual='cancelled']").first();
    await expect(active).toHaveCSS("background-color", PASTEL.active);
    await expect(completed).toHaveCSS("background-color", PASTEL.completed);
    await expect(cancelled).toHaveCSS("background-color", PASTEL.cancelled);

    await expect(nextCard).toHaveAttribute("data-appointment-visual", /active|completed|cancelled|unavailable/);

    await page.screenshot({ path: shotName("meu-dia", testInfo), fullPage: true });
  });

  test("Meu Dia dark mode mantém distinção pastel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "dark só no desktop");
    test.setTimeout(90_000);
    await loginViaUi(page);
    await page.getByRole("button", { name: "Ativar tema escuro" }).click();

    const active = page.locator("[data-appointment-visual='active']").first();
    const completed = page.locator("[data-appointment-visual='completed']").first();
    const cancelled = page.locator("[data-appointment-visual='cancelled']").first();
    await expect(active).toBeVisible();
    await expect(completed).toBeVisible();
    await expect(cancelled).toBeVisible();

    const colors = await Promise.all(
      [active, completed, cancelled].map((locator) =>
        locator.evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    );
    expect(new Set(colors).size).toBe(3);
    for (const color of colors) {
      expect(color).not.toBe(PASTEL.active);
      expect(color).not.toBe("rgb(52, 168, 83)");
      expect(color).not.toBe("rgb(26, 115, 232)");
      expect(color).not.toBe("rgb(217, 48, 37)");
    }

    await page.screenshot({
      path: path.join(OUT, "meu-dia-dark-1440x900.png"),
      fullPage: true,
    });
  });
});
