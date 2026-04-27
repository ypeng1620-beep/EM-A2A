# EM-A2A: AI Agent 链上经济体

> 将支付宝的所有 C 端功能以 A2A（Agent-to-Agent）形态独立产品化，链上合规，抽成变现。

## 定位

B.AI 是 AI 世界的支付宝+身份证+运营商。EM-A2A 在此基础上，把支付宝的每个功能拆成独立可部署的 A2A 产品，通过 x402 支付协议 + 8004 链上身份 + 智能合约抽成实现变现。

## 产品矩阵 (10 个独立 npm 包)

| 产品 | 包名 | 对标支付宝 | MVP |
|------|------|-----------|-----|
| A2A Pay | `@em/a2a-pay` | 支付/转账 | P0 |
| A2A ID | `@em/a2a-id` | 实名认证 | P0 |
| A2A Credit | `@em/a2a-credit` | 芝麻信用 | P0 |
| A2A Market | `@em/a2a-market` | 商家服务 | P0 |
| A2A Lend | `@em/a2a-lend` | 花呗/借呗 | P1 |
| A2A Earn | `@em/a2a-earn` | 余额宝 | P1 |
| A2A Insure | `@em/a2a-insure` | 保险 | P1 |
| A2A Invoice | `@em/a2a-invoice` | 发票/缴费 | P2 |
| A2A Invest | `@em/a2a-invest` | 蚂蚁财富 | P2 |
| A2A Reward | `@em/a2a-reward` | 蚂蚁森林 | P2 |

## 共享基础设施

| 包名 | 职责 |
|------|------|
| `@em/a2a-core` | 共享类型、x402 协议、8004 身份原语、链抽象层 |
| `@em/a2a-contracts` | Solidity 智能合约 (抽成/托管/信用/支付) |
| `@em/a2a-compliance` | KYC/AML/审计合规引擎 |

## 技术栈

- **Runtime**: Node.js >= 22.14
- **Language**: TypeScript 5.x (strict)
- **Contracts**: Solidity 0.8.x + Hardhat
- **Chain**: TRON (主), EVM L2 (扩展)
- **Database**: SQLite (better-sqlite3)
- **Package Manager**: pnpm (monorepo)

## 快速开始

```bash
pnpm install
pnpm build
pnpm test
```

## 目录结构

```
EM-A2A/
├── packages/          # 10+3 个独立 npm 包
├── contracts/         # Solidity 合约
├── docs/              # 架构/路线图/合规文档
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```
