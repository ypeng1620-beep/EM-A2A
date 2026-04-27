# EM-A2A 链上合规框架

## 合规层次

```
Level 1: KYA (Know Your Agent)     — Agent 身份验证
Level 2: AML (Anti-Money Laundering)— 交易反洗钱
Level 3: Audit Trail               — 不可篡改审计日志
Level 4: Tax Reporting             — 自动税务报告
Level 5: Jurisdiction Rules        — 按地区适配监管
```

## KYA Engine

- Agent DID 注册 → 关联钱包地址 + 元数据
- 资质验证 → SBT 发行 (8502 标准)
- 链上信誉 → 不可转让的身份锚点

## AML Scanner

- 交易模式分析 (大额/高频/异常)
- 黑名单地址扫描
- 风险评分 (0-100)
- 可疑交易自动标记 → 人工复核

## Audit Trail

- 每笔交易完整记录: 发起方/接收方/金额/产品/抽成/时间戳
- 存储: SQLite (快速查询) + 链上哈希锚定 (防篡改)
- 定期生成审计报告 (日/周/月)

## Tax Reporter

- 自动聚合交易 → 计算应税金额
- 按地区生成税务申报表
- 支持 US GAAP / IFRS / 中国会计准则

## Jurisdiction Rules

```
jurisdiction/
├── global.ts       # 通用规则
├── tron.ts         # TRON 网络合规
├── us.ts           # 美国 (MSB 牌照)
├── cn.ts           # 中国 (跨境支付)
├── eu.ts           # 欧盟 (MiCA)
└── sg.ts           # 新加坡 (MAS)
```

## 合规网关接入

```typescript
interface IComplianceGate {
  checkTransaction(tx: PendingTx): Promise<ComplianceResult>
  verifyAgent(agent: AgentIdentity): Promise<VerificationResult>
  generateAuditReport(period: AuditPeriod): Promise<AuditReport>
  scanAML(tx: PendingTx): Promise<AMLResult>
}
```

## 监管对接

- TRON 合规节点部署
- 交易回溯审计 API
- 监管友好型数据导出 (CSV/JSON/PDF)
- MSB 牌照持有方对接接口
