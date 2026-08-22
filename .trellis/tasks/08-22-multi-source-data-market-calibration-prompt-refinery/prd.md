# Multi-source data, market calibration, prompt refinery

## Goal

1. 多数据源稳定性：EastMoney 失败时自动回退到免费源（新浪 / 腾讯）拉取日线与基金净值，带重试；提供数据源体检命令。
2. 全球/国内市场校准：拉取国内外指数快照（上证、深成、创业板、沪深300、中证500、恒生、道指、标普、纳指100、日经225），确定性计算行情状态，注入 AI 分析提示词。
3. 提示词模板：可调参数化模板（严格度、风险关注、校准权重、篇幅、推理深度）；每次分析后按反馈评分自我迭代（版本号、变更日志、localStorage 持久化）。
4. 图表优化：周期范围扩展（60/120），展示实际数据源与数据新鲜度。

## Requirements

- 全部数据源必须为免费公开查询接口，无需密钥。
- K 线回退链：eastmoney → sina → tencent，逐根 bar 记录实际 provider。
- 场外基金净值：eastmoney lsjz 为主，失败回退 fundmobapi。
- market_get_context 返回指数快照 + 全球风险偏好 + A 股趋势位置（确定性计算，不调用 LLM）。
- runAnalysis 接受可选 marketContext 与 template；会话记录 templateVersion 与 marketContext。
- 模板精炼：evaluateTemplateFeedback + refineTemplate + LocalTemplateRepository，扫描后自动应用。
- UI：偏好页多源体检与模板设置；智能分析页模板版本徽章 + 市场环境面板；图表范围 7/20/30/60/120 + 数据源标签。

## Acceptance Criteria

- [ ] cargo test 通过；sina/tencent 解析器有 fixture 测试；context 统计有合成数据测试
- [ ] pnpm test / lint / build 通过
- [ ] pnpm tauri build 产出安装包并验证路径
- [ ] 每次扫描后模板版本/参数按反馈自动演进，变更日志可查，可一键重置
