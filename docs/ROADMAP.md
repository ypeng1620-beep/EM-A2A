# EM-A2A 路线图

## Phase 0: 基础设施搭建 (Week 1-2)

- [ ] `@poisonpyf/a2a-core` — 共享类型 + 链抽象接口 + 协议定义
- [ ] `@poisonpyf/a2a-contracts` — RevenueSplitter + Escrow + AgentRegistry 合约
- [ ] `@poisonpyf/a2a-compliance` — KYA/AML 框架骨架
- [ ] monorepo 配置 (pnpm workspace + tsconfig + ESLint)

## Phase 1: P0 快速变现 (Week 3-6)

- [ ] `@poisonpyf/a2a-pay` — Agent 支付通道 (USDC/USDT 转账、微支付)
- [ ] `@poisonpyf/a2a-id` — Agent DID 注册 + KYA 认证
- [ ] `@poisonpyf/a2a-credit` — 链上信用评分 + SBT 记录
- [ ] `@poisonpyf/a2a-market` — Agent 服务市场 (上架/发现/履约/评价)
- [ ] 合约部署到 TRON 测试网
- [ ] 集成测试 (4 产品联调)

## Phase 2: P1 高客单扩展 (Week 7-12)

- [ ] `@poisonpyf/a2a-lend` — Agent 信贷 (基于信用分)
- [ ] `@poisonpyf/a2a-earn` — Agent 理财 (闲置资金生息)
- [ ] `@poisonpyf/a2a-insure` — Agent 保险 (服务履约险)
- [ ] 合约部署到 TRON 主网

## Phase 3: P2 生态完善 (Week 13+)

- [ ] `@poisonpyf/a2a-invoice` — 自动结算/税务
- [ ] `@poisonpyf/a2a-invest` — AI 投顾/资管
- [ ] `@poisonpyf/a2a-reward` — 行为激励/积分
- [ ] 多链扩展 (Arbitrum / Solana)
- [ ] 企业级运维面板
