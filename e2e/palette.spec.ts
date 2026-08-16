import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./tauri-mock";

async function openApp(page: Page, route: string) {
  await installTauriMock(page);
  await page.goto(route);
}

test("command palette dialog is vertically centered and fully visible", async ({
  page,
}) => {
  await openApp(page, "/");
  await page.keyboard.press("Control+K");
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  // 完全可见：不超出上下边界
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  // 垂直居中：中心与视口中心偏差 ≤ 60px
  const centerY = box!.y + box!.height / 2;
  expect(Math.abs(centerY - viewport.height / 2)).toBeLessThan(60);
  // 面板可交互：搜索框可见
  await expect(dialog.getByPlaceholder(/搜索/)).toBeVisible();
});
