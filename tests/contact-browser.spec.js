const { test, expect } = require("playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const formMarkup = `
  <form data-contact-form>
    <input name="name" required>
    <input name="phone" required>
    <input name="email" type="email" required>
    <input name="city">
    <select name="service" required><option selected>Spark Connect</option></select>
    <textarea name="message" required></textarea>
    <input name="website" value="">
    <input name="startedAt" value="">
    <input name="originatingPage" value="">
    <button data-submit-button type="submit">Request Estimate</button>
    <p data-form-status role="status" aria-live="polite" tabindex="-1"></p>
  </form>`;

async function loadForm(page, status) {
  await page.setContent(formMarkup);
  await page.evaluate((responseStatus) => {
    window.fetch = async () => new Response(
      responseStatus === 200 ? '{"ok":true}' : '{"error":"failed"}',
      { status: responseStatus, headers: { "Content-Type": "application/json" } },
    );
  }, status);
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8") });
  await page.locator('[name="name"]').fill("Jane Customer");
  await page.locator('[name="phone"]').fill("251-555-0100");
  await page.locator('[name="email"]').fill("jane@example.com");
  await page.locator('[name="city"]').fill("Fairhope");
  await page.locator('[name="message"]').fill("Network project");
}

test("shows success, clears fields, and focuses the live result", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadForm(page, 200);
  await page.locator("button").click();
  const status = page.locator("[data-form-status]");
  await expect(status).toHaveText("Thank you. Your project request has been sent to Spark Electric.");
  await expect(status).toBeFocused();
  await expect(page.locator('[name="name"]')).toHaveValue("");
  await expect(page.locator("button")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("shows failure, preserves fields, and focuses the live result", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await loadForm(page, 502);
  await page.locator("button").click();
  const status = page.locator("[data-form-status]");
  await expect(status).toHaveText("We couldn’t send your request right now. Please call or text 251-620-9769, or email info@getsparkwired.com.");
  await expect(status).toBeFocused();
  await expect(page.locator('[name="name"]')).toHaveValue("Jane Customer");
  await expect(page.locator("button")).toBeEnabled();
  expect(errors).toEqual([]);
});
