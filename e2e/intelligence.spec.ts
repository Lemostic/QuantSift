import { expect, test, type Page } from "@playwright/test";
import { installTauriMock } from "./tauri-mock";

async function openApp(page: Page, route: string) {
  await installTauriMock(page);
  await page.goto(route);
}

test("intelligence workbench renders empty state and schedule summary", async ({
  page,
}) => {
  await openApp(page, "/intelligence");
  await expect(page.getByRole("heading", { name: "智能分析" })).toBeVisible();
  // 空状态提示
  await expect(page.getByText("还没有分析会话")).toBeVisible();
  // 未启用模型提示
  await expect(page.getByText(/尚未启用任何 AI 模型/)).toBeVisible();
});

test("preferences expose AI model, factor and schedule groups", async ({
  page,
}) => {
  await openApp(page, "/modules/preferences");
  await expect(
    page.getByRole("heading", { name: "AI 分析模型" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "随机因子" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 更新因子" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "智能扫描（交易时段）" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "添加模型" })).toBeEnabled();
  // 预设切换：选中 MiniMax 国内站后添加模型应填入对应端点
  await page.getByLabel("选择模型预设").selectOption("minimax-cn");
  await page.getByRole("button", { name: "添加模型" }).click();
  await expect(
    page.locator('input[value="https://api.minimax.chat/v1"]'),
  ).toBeVisible();
});

test("watchlist row offers the intelligent-analysis opt-in action", async ({
  page,
}) => {
  await openApp(page, "/watchlist");
  await expect(page.getByRole("heading", { name: "监控中心" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /参与智能分析/ }).first(),
  ).toBeVisible();
});

test("watchlist searches the market and adds a new instrument", async ({
  page,
}) => {
  await openApp(page, "/watchlist");
  await expect(page.getByRole("heading", { name: "监控中心" })).toBeVisible();
  await expect(page.getByText(/4 ACTIVE \/ 4 TOTAL/)).toBeVisible();

  // 实时搜索：输入代码 000001 → 资产目录出现平安银行（默认自选未包含）
  await page.getByPlaceholder("搜索全市场：代码或名称").fill("000001");
  await expect(page.getByRole("button", { name: "添加 平安银行" })).toBeVisible({
    timeout: 20_000,
  });

  // 添加后：启用数与总数都变为 5，且候选列表不再出现该标的
  await page.getByRole("button", { name: "添加 平安银行" }).click();
  await expect(page.getByText(/5 ACTIVE \/ 5 TOTAL/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加 平安银行" }),
  ).toHaveCount(0);
});
