import { expect, test } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "artifacts/visual-refresh");

function shotName(label: string, testInfo: { project: { name: string } }) {
  const viewport = testInfo.project.name === "mobile-chromium" ? "390x844" : "1440x900";
  return path.join(OUT, `${label}-${viewport}.png`);
}

test.describe("Visual Refresh V2 — screenshots", () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test("design-system Card e primitivos", async ({ page }, testInfo) => {
    await page.goto("/design-system");
    await expect(page.getByRole("heading", { name: "Card" })).toBeVisible();
    await page.screenshot({
      path: shotName("design-system", testInfo),
      fullPage: true,
    });
  });

  test("telas autenticadas focais", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await loginViaUi(page);
    const routes = [
      ["meu-dia", "/app"],
      ["agenda", "/app/agenda"],
      ["pacientes", "/app/patients"],
      ["configuracoes", "/app/settings"],
      ["financeiro", "/app/finance"],
      ["documentos", "/app/documents"],
    ] as const;

    for (const [label, href] of routes) {
      await page.goto(href);
      await page.waitForLoadState("domcontentloaded");
      await page.screenshot({
        path: shotName(label, testInfo),
        fullPage: true,
      });
    }
  });

  test("tablet 768x1024 no dashboard", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "tablet só no projeto desktop");
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginViaUi(page);
    await page.screenshot({
      path: path.join(OUT, "meu-dia-768x1024.png"),
      fullPage: true,
    });
  });
});
