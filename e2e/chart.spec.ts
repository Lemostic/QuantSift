import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./tauri-mock";

async function openApp(page: Page, route: string) {
  await installTauriMock(page);
  await page.goto(route);
}

test("research chart shows the indicator legend and crosshair readout", async ({
  page,
}) => {
  await openApp(page, "/");
  await expect(page.getByText("信号排名")).toBeVisible();
  // 图例条：指标名与当前值
  await expect(page.getByText("MA5").first()).toBeVisible();
  await expect(page.getByText("MA20").first()).toBeVisible();
  await expect(page.getByText("MACD").first()).toBeVisible();
  await expect(page.getByText("KDJ").first()).toBeVisible();
  await expect(page.getByText("RSI").first()).toBeVisible();
  // 十字光标读数面板（默认展示最新一根）
  await expect(page.getByText(/开\s+\d+\.\d+/).first()).toBeVisible();
  await expect(page.getByText(/收\s+\d+\.\d+/).first()).toBeVisible();
});

test("expanded K-line dialog is vertically centered with legend", async ({
  page,
}) => {
  await openApp(page, "/");
  await expect(page.getByText("信号排名")).toBeVisible();
  await page.getByRole("button", { name: "全屏查看 K 线" }).click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  // 垂直居中：中心点与视口中心偏差不超过 60px
  const centerY = box!.y + box!.height / 2;
  expect(Math.abs(centerY - viewport.height / 2)).toBeLessThan(60);
  // 全屏弹窗内同样有图例
  await expect(dialog.getByText("MA5").first()).toBeVisible();
  await expect(dialog.getByText("BOLL").first()).toBeVisible();
});
