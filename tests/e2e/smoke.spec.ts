import { expect, test } from "@playwright/test";

test("página inicial da fundação carrega", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SerenaPsi" })).toBeVisible();
  await expect(page.getByRole("img", { name: "SerenaPsi" })).toBeVisible();
});
