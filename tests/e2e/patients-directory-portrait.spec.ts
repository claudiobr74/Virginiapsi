import { expect, test } from "@playwright/test";
import { loginViaUi } from "./support/fixtures";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = path.join("artifacts", "patients-foto-meu-dia");

test.describe("Diretório e Meu Dia — retratos", () => {
  test("captura diretório e hero do Meu Dia", async ({ page }, testInfo) => {
    mkdirSync(OUT, { recursive: true });
    const suffix = testInfo.project.name;
    const isMobile = suffix === "mobile-chromium";
    await loginViaUi(page);

    await page.goto("/app/patients?search=Beatriz");
    const beatriz = page.getByRole("link", { name: /Beatriz/ });
    await expect(beatriz).toBeVisible();
    await expect(beatriz.getByText("—")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Foto de Beatriz" })).toHaveCount(0);
    await expect(beatriz.getByText("B", { exact: true })).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, `directory-without-photo-${suffix}.png`),
      fullPage: true,
    });

    await page.goto("/app/patients?search=Retrato");
    const portrait = page.getByRole("link", { name: /Retrato Com Foto/ });
    await expect(portrait).toBeVisible();
    const patientPhoto = page.getByRole("img", { name: "Foto de Retrato Com Foto" });
    await expect(patientPhoto).toBeVisible();
    await expect
      .poll(async () => patientPhoto.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(portrait.getByText("—")).toHaveCount(0);
    await page.screenshot({
      path: path.join(OUT, `directory-with-photo-${suffix}.png`),
      fullPage: true,
    });

    if (suffix === "desktop-chromium") {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.screenshot({
        path: path.join(OUT, "directory-tablet.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /Ana Serena/ })).toBeVisible();
    const heroPhoto = page.getByRole("img", { name: "Foto de Ana Serena" });
    await expect(heroPhoto).toBeVisible();
    const hero = page.locator(".myday-hero");
    const photoBox = await heroPhoto.boundingBox();
    const heroBox = await hero.boundingBox();
    expect(photoBox).toBeTruthy();
    expect(heroBox).toBeTruthy();
    expect(Math.abs((photoBox?.width ?? 0) - (photoBox?.height ?? 0))).toBeLessThan(2);
    if (isMobile) {
      expect(photoBox?.width ?? 0).toBeGreaterThanOrEqual(92);
      expect(photoBox?.width ?? 0).toBeLessThanOrEqual(100);
    } else {
      expect(photoBox?.width ?? 0).toBeGreaterThanOrEqual(108);
      expect(photoBox?.width ?? 0).toBeLessThanOrEqual(116);
    }
    await page.screenshot({
      path: path.join(OUT, `myday-${suffix}.png`),
      fullPage: true,
    });
  });
});
