import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./tauri-mock";

async function openApp(page: Page, route: string) {
  await installTauriMock(page);
  await page.goto(route);
}

test("backtest labels expose term tooltips linking to the handbook", async ({
  page,
}) => {
  await openApp(page, "/backtest");
  await page.getByRole("button", { name: "运行回测" }).click();
  await expect(page.getByText("最大回撤").first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("最大回撤").first().hover();
  await expect(
    page
      .getByText("账户净值从历史高点跌到后续最低点的最大幅度。")
      .first(),
  ).toBeVisible();
  await page.getByRole("link", { name: /手册中查看完整解释/ }).first().click();
  await expect(
    page.getByRole("heading", { name: "投资术语手册" }),
  ).toBeVisible();
});

test("glossary handbook searches terms by keyword", async ({ page }) => {
  await openApp(page, "/glossary");
  await expect(
    page.getByRole("heading", { name: "投资术语手册" }),
  ).toBeVisible();
  await page.getByLabel("搜索术语").fill("复权");
  await expect(page.getByRole("button", { name: /复权/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /复权/ }).first().click();
  await expect(page.getByText("把除权除息造成的价格跳空修正回来")).toBeVisible();
});

test("glossary manual update merges web terms", async ({ page }) => {
  await page.route("**/docs/glossary.json", (route) =>
    route.fulfill({
      json: [
        {
          id: "test-web-term",
          term: "测试词条",
          category: "智能分析",
          summary: "来自网络更新的词条",
          detail: "详细解释",
        },
      ],
    }),
  );
  await openApp(page, "/glossary");
  await page.getByRole("button", { name: "更新手册" }).click();
  await expect(page.getByText("测试词条")).toBeVisible();
  await expect(page.getByText(/更新于/).first()).toBeVisible();
});
