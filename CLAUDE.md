# CLAUDE.md

## 项目概述

EM-A2A：AI Agent 链上经济体 — 将支付宝的 C 端功能以 A2A（Agent-to-Agent）形态独立产品化，基于 TRON 链上合规运行。定位是 AI 世界的支付宝+身份证+运营商。

- **仓库**: github.com/ypeng1620-beep/EM-A2A
- **分支**: main
- **Node**: >= 22.14.0
- **包管理**: pnpm 9 + workspace monorepo
- **语言**: TypeScript 5.5+ (ESM, composite project references)

## 项目结构

```
EM-A2A/
├── contracts/               # Solidity 智能合约 (Hardhat)
│   ├── RevenueSplitter      # 收益分账
│   ├── Escrow               # 托管
│   ├── AgentRegistry        # Agent 注册表
│   └── MicroPayment         # 小额支付
├── packages/                # 14 个 A2A 产品包
│   ├── a2a-core/            # 共享核心：类型、链抽象、x402 协议、8004 身份
│   ├── a2a-pay/             # Agent 间支付
│   ├── a2a-escrow/          # （待实现）
│   ├── a2a-credit/          # 信用评分 (300-950)
│   ├── a2a-market/          # Agent 市场
│   ├── a2a-lend/            # Agent 借贷
│   ├── a2a-earn/            # Agent 理财
│   ├── a2a-insure/          # Agent 保险
│   ├── a2a-invoice/         # Agent 发票
│   ├── a2a-invest/          # Agent 投资
│   ├── a2a-reward/          # Agent 积分
│   ├── a2a-compliance/      # 合规模块
│   ├── a2a-id/              # 身份模块
│   └── a2a-mcp/             # MCP Server 入口（ClawHub 上架包）
├── tsconfig.json            # 根配置：project references 指向 14 个包
├── tsconfig.base.json       # 各包 tsconfig 继承的基础配置
└── .github/workflows/ci.yml # CI：7 个并行 job
```

## 已完成的阶段

### Phase A — 141 个 A2A Agent 注册 + 链上合约

- TRON Shasta 测试网部署
- AgentRegistry 合约记录 141 个 Agent DID
- RevenueSplitter 合约配置抽成

### Phase B — x402 支付协议 + 8004 链上身份

- `@poisonpyf/a2a-core` 包含 x402 协议实现
- 8004 身份通过 TRON 钱包签名验证
- Agent DID 格式: `did:em:<chain>:<address>`

### Phase C — a2a-market Agent 发现平台

- 注册、搜索、排序 Agent
- 按能力分类、按信誉过滤

### Phase D — MCP Server + ClawHub Skill + 文档

- `@poisonpyf/a2a-mcp` 提供 4 个 MCP tool: `a2a_pay`, `a2a_escrow`, `a2a_credit`, `a2a_revenue`
- ClawHub skill 配置文件已生成
- README 和 docs 已完成

### CI 修复 (2026-04-28)

两次 commit 修复了所有 GitHub Actions CI 失败：

- **bb5d196**: fix eslint (`no-require-imports`), prettier (57 files), tsconfig (root references + composite), exports field (conditional exports + package.json export), CI test job needs build
- **dcc50c9**: fix — 添加 `types: ["node"]` 到 tsconfig.base.json（解决 CI 上 `process`/`Buffer`/`crypto` 找不到），test job 内联 `pnpm run build`（CI job 在不同 runner 上运行，`needs:` 不共享文件）

CI 全部通过 ✅（7/7 jobs green）: Lint, Format check, Typecheck, Build, Unit tests, Contracts compile, Contracts test

## 关键技术决策

1. **composite project references** — 根 `tsconfig.json` 使用 `references` 指向所有包，启用 `tsc -b` 增量构建
2. **conditional exports** — 所有 package.json 的 `exports` 使用 `types`/`import`/`default` 三元组，并显式导出 `./package.json`
3. **CI 不跨 runner 共享文件** — 每个 job 独立 checkout + install + build，不能依赖 `needs:` 传递 dist/
4. **better-sqlite3** 是可选原生依赖，`require()` 调用用 eslint-disable 注释豁免
5. **pnpm `workspace:*`** 协议用于内部包依赖

## 下一步

1. **npm 发布 `@poisonpyf/a2a-mcp`** — `cd packages/a2a-mcp && npm publish`
2. **ClawHub 上架** — 提交 MCP skill 到 ClawHub 市场
3. 按用户需求继续 Phase E+（跨链兼容 / 主网部署 / 正式上线）
