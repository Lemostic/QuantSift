# QuantSift

QuantSift 是一款本地优先的个人桌面量化研究助手。首个版本聚焦 A 股与公募基金的日频数据，通过透明的趋势、动量和波动风险因子，对观察标的进行排序并解释推荐原因。

> QuantSift 只提供研究线索，不构成投资建议，不承诺收益，也不会自动下单。

## 当前版本

- Tauri 2 + React 19 + TypeScript 桌面应用
- 股票、基金统一标的与日线模型
- 可替换的 `MarketDataProvider` 数据边界
- MA5/MA20、20 日动量、年化波动率因子
- “买入观察 / 继续观察 / 暂不交易”三级研究信号
- 因子拆解、推荐理由、风险提示和数据时间
- 持仓成本、浮动盈亏、当日盈亏与退出风险复核
- 可解释智能研判：因子一致性、滚动稳定度、市场状态与关键价位
- 本地命令面板，可快速跳转研究、监控、持仓、扫描和提醒工作区
- 内置离线行情样例，开发和演示不依赖外部 API

当前数据是用于验证完整产品链路的固定样例，并非实时行情。下一阶段将通过独立 provider 接入 AKShare，并加入 SQLite 增量缓存。

## 开发

环境要求：Node.js 20+、pnpm 9+、Rust MSVC 工具链、Windows WebView2。

```powershell
pnpm install
pnpm test
pnpm lint
pnpm dev
```

启动 Tauri 开发模式：

```powershell
pnpm tauri dev
```

## Windows 打包

双击仓库根目录的 `build-windows.cmd`。脚本会依次执行依赖检查、测试、类型检查和 Tauri 打包，完成后自动打开安装包目录。

Windows Smart App Control 会阻止 Rust 构建生成的临时 EXE/DLL。脚本检测到该状态时会打开相应的 Windows 安全页面，并等待用户手动关闭；脚本不会修改安全注册表或关闭 Defender。

产物默认位于：

```text
src-tauri\target\release\bundle\
```

## 主要目录

```text
src/quant/       领域类型与推荐引擎
src/data/        数据提供方契约、离线 provider、应用服务
src/routes/      桌面视图
src-tauri/       Tauri 2 后端与打包配置
scripts/         Windows 构建脚本
docs/            产品边界与后续实施说明
```

## License

MIT。桌面基础壳源自 Lemostic/velora，保留原项目许可声明。
