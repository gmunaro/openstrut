import { expect, test } from "@playwright/test";

test("abre a tela inicial", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OpenStrut V2" })).toBeVisible();
});
