import { expect, test, type Locator, type Page } from "@playwright/test";
import { installTauriMock } from "./tauri-mock";

/**
 * The switch knob must stay inside the track in both states. Regression
 * guard for the bug where the knob lacked an explicit `left`, so its static
 * position was centered by the button's UA `text-align: center` and the
 * enabled knob ended up past the track's right edge.
 */
async function expectKnobInsideTrack(sw: Locator) {
  const track = await sw.boundingBox();
  const knob = await sw.locator("span").boundingBox();
  expect(track).not.toBeNull();
  expect(knob).not.toBeNull();
  expect(knob!.x).toBeGreaterThanOrEqual(track!.x - 0.5);
  expect(knob!.x + knob!.width).toBeLessThanOrEqual(track!.x + track!.width + 0.5);
}

async function openApp(page: Page, route: string) {
  await installTauriMock(page);
  await page.goto(route);
}

test("scan schedule switch keeps the knob inside the track in both states", async ({
  page,
}) => {
  await openApp(page, "/scans");
  const sw = page.getByRole("switch").first();
  await expect(sw).toBeVisible();

  const initiallyChecked = (await sw.getAttribute("aria-checked")) === "true";
  await expectKnobInsideTrack(sw);

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(!initiallyChecked));
  await expectKnobInsideTrack(sw);

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(initiallyChecked));
  await expectKnobInsideTrack(sw);
});

test("backtest signal-exit switch toggles with the knob inside the track", async ({
  page,
}) => {
  await openApp(page, "/backtest");
  const sw = page.getByRole("switch");
  await expect(sw).toBeVisible();

  const initiallyChecked = (await sw.getAttribute("aria-checked")) === "true";
  await expectKnobInsideTrack(sw);

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(!initiallyChecked));
  await expectKnobInsideTrack(sw);
});

test("watchlist monitor switch keeps the knob inside the track", async ({
  page,
}) => {
  await openApp(page, "/watchlist");
  await expect(page.getByRole("heading", { name: "监控中心" })).toBeVisible();
  const sw = page.getByRole("switch").first();
  await expect(sw).toBeVisible();
  await expectKnobInsideTrack(sw);
});

test("dashboard renders the research workspace with live-shaped data", async ({
  page,
}) => {
  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: "市场研究台" }),
  ).toBeVisible();
  // The fixture series produces a ranked queue; at least one row must render.
  await expect(page.getByText("信号排名")).toBeVisible();
  await expect(page.getByRole("button", { name: /刷新信号/ })).toBeEnabled();
});
