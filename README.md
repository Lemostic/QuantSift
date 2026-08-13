# QuantSift

QuantSift 是一款本地优先的个人桌面量化研究助手。首个版本聚焦 A 股与公募基金的日频数据，通过透明的趋势、动量和波动风险因子，对观察标的进行排序并解释推荐原因。

> QuantSift 只提供研究线索，不构成投资建议，不承诺收益，也不会自动下单。

## 当前版本

- Tauri 2 + React 19 + TypeScript 桌面应用
- 股票、基金统一标的与日线模型
- 可替换的 `MarketDataProvider` 数据边界
- AKShare 实时数据源（Python sidecar），失败时自动回退离线样例
- MA5/MA20、20 日动量、年化波动率因子
- “买入观察 / 继续观察 / 暂不交易”三级研究信号
- 因子拆解、推荐理由、风险提示和数据时间
- 持仓成本、浮动盈亏、当日盈亏与退出风险复核
- 可解释智能研判：因子一致性、滚动稳定度、市场状态与关键价位
- 确定性回测：止损/止盈/时间退出边界、佣金印花税与滑点成本、权益与回撤曲线
- 本地命令面板，可快速跳转研究、监控、持仓、扫描和提醒工作区
- 内置离线行情样例，开发和演示不依赖外部 API

数据流：前端只依赖 `MarketDataProvider` 契约。生产模式通过 Tauri 命令调用
Python sidecar（`sidecar/quantsift_sidecar.py`，底层使用 AKShare 拉取 A 股、
ETF 与场外基金日线）；sidecar 不可用或网络失败时自动回退到内置离线样例，
并在看板顶部显示数据源与回退提示。

## 开发

环境要求：Node.js 20+、pnpm 9+、Rust 工具链。macOS 需 Xcode Command Line
Tools；Windows 需 MSVC 工具链与 WebView2。

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

Python sidecar 测试（不依赖网络）：

```bash
python3 -m pytest sidecar -v
```

## Windows 打包

双击仓库根目录的 `build-windows.cmd`。脚本会依次执行依赖检查、测试、类型检查和 Tauri 打包，完成后自动打开安装包目录。

Windows Smart App Control 会阻止 Rust 构建生成的临时 EXE/DLL。脚本检测到该状态时会打开相应的 Windows 安全页面，并等待用户手动关闭；脚本不会修改安全注册表或关闭 Defender。

产物默认位于：

```text
src-tauri\target\release\bundle\
```

## macOS 打包

在 macOS 上运行 `./build-macos.sh` 构建**通用包（Universal Binary）**，同一安装包同时支持 Intel（x86_64）和 Apple Silicon（arm64）机型。

脚本会依次完成依赖安装、测试、类型检查，并通过 `rustup` 自动补装 `x86_64-apple-darwin` 与 `aarch64-apple-darwin` 两个 Rust 目标，然后以 `universal-apple-darwin` 目标构建 Tauri 应用。

环境要求：macOS + Xcode Command Line Tools、Node.js 20+、pnpm 9+、Rust（rustup）。

```bash
./build-macos.sh               # 完整构建（含测试与类型检查）
./build-macos.sh --skip-check  # 跳过 Rust 目标安装检查，仅构建
./build-macos.sh --help        # 查看用法
```

产物默认位于：

```text
src-tauri/target/universal-apple-darwin/release/bundle/
```

构建完成后可用 `lipo` 验证是否为通用二进制：

```bash
lipo -archs src-tauri/target/universal-apple-darwin/release/bundle/macos/QuantSift.app/Contents/MacOS/QuantSift
# 预期输出：x86_64 arm64
```

首次构建需要同时编译两个架构，耗时较长属正常现象。注意：Tauri 默认生成的 `.app` 为未签名（ad-hoc）构建，直接分发给其他 Mac 时需自行处理签名与公证。

## 主要目录

```text
src/quant/       领域类型与推荐引擎
src/data/        数据提供方契约、AKShare provider、离线样例、回退注册表
src/routes/      桌面视图
src-tauri/       Tauri 2 后端与打包配置
  src/sidecar/   Python sidecar 进程管理与 JSON-RPC 客户端
sidecar/         AKShare Python sidecar 与录制 fixtures
scripts/         Windows 构建脚本
build-macos.sh   macOS 通用包构建脚本
docs/            产品边界与后续实施说明
```

## License

MIT。桌面基础壳源自 Lemostic/velora，保留原项目许可声明。
