# EM-A2A 架构文档

## 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    A2A Product Layer (10 independent npm pkgs)   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ Pay  │ │Credit│ │Lend  │ │Earn  │ │Insure│ │Market│  ...     │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘         │
├─────┼────────┼────────┼────────┼────────┼────────┼──────────────┤
│     │  ┌─────────────────────────────────────────────────┐      │
│     └──┤   Revenue Splitting Engine (Smart Contract)     │      │
│        │   固定级差 / 可变浮动 双模式，客户自选            │      │
│        └──────────────────────┬──────────────────────────┘      │
├───────────────────────────────┼──────────────────────────────────┤
│                     x402 A2A Payment Protocol                    │
│          稳定币收发 · 法币出入金 · 跨链兑换 · 微支付通道          │
├───────────────────────────────┼──────────────────────────────────┤
│                     8004 On-Chain Identity                        │
│        Agent DID · SBT 资质 · 信用评分 · 链上行为记录             │
├───────────────────────────────┼──────────────────────────────────┤
│              Compliance Layer (@em/a2a-compliance)               │
│     KYC/KYA · AML · 交易审计 · 税务申报 · 监管适配 (TRON)        │
├───────────────────────────────┼──────────────────────────────────┤
│         Chain Abstraction Layer (TRON / EVM L2 / Solana)         │
├───────────────────────────────┴──────────────────────────────────┤
│                  FusionWorkspace Core Runtime                     │
│  TAOR Loop · Gateway · Permission Engine · Memory · Phoenix      │
│  ai-agent-guard (Safety Middleware)                               │
└──────────────────────────────────────────────────────────────────┘
```

## 核心原则

1. **独立部署** — 每个产品是独立的 npm 包，可单独发布、部署、收费
2. **链无关设计** — 通过 `IChainAdapter` 接口抽象链差异，默认实现 TRON，可插拔 EVM L2 / Solana
3. **双抽成模式** — 固定级差 + 可变浮动，客户注册时自选
4. **合规先行** — 每层都内建 KYC/AML/审计，不可绕过
5. **复用 B.AI 底座** — 依赖 FusionWorkspace 的 Gateway、Permission、Phoenix、Memory

## 数据流

```
Agent A 发起交易
  → 产品 API (如 a2a-pay)
    → RevenueEngine 计算抽成
      → Compliance 合规检查
        → x402 Protocol 封装支付指令
          → IChainAdapter 上链执行
            → Smart Contract 托管/结算
              → 8004 Identity 记录行为
                → 返回 TxReceipt + 审计日志
```

## 包依赖图

```
@em/a2a-pay ──────┐
@em/a2a-credit ───┤
@em/a2a-market ───┤
@em/a2a-lend ─────┤
@em/a2a-earn ─────┼──→ @em/a2a-core ──→ @em/a2a-contracts
@em/a2a-insure ───┤         │
@em/a2a-id ───────┤         └──→ @em/a2a-compliance
@em/a2a-invoice ──┤
@em/a2a-invest ───┤
@em/a2a-reward ───┘
```
