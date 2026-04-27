# EM-A2A 部署指南

## 概览

EM-A2A 由两部分组成：
1. **Solidity 智能合约** — 4 个合约部署到 TRON 网络
2. **TypeScript 产品包** — 10 个 npm 包，可部署到任意 Node.js 环境

---

## 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 22.14.0 | 运行时 |
| pnpm | ≥ 9.x | 包管理 |
| Hardhat | 2.22+ | 合约编译/部署 |
| TRON 钱包 | — | 部署账户 (需充足 TRX) |

---

## 一、合约部署

### 1.1 前置准备

```bash
# 安装依赖
pnpm install
cd contracts && pnpm install && cd ..

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入:
#   PRIVATE_KEY=你的部署账户私钥
#   TRONSCAN_API_KEY=你的 TronScan API Key (用于验证)
#   MULTISIG_ADDRESS=多签地址 (主网部署后转移 ownership)
```

### 1.2 编译合约

```bash
pnpm contracts:compile
# 或: cd contracts && pnpm compile
```

### 1.3 Shasta 测试网部署

```bash
pnpm contracts:deploy:shasta
```

部署完成后输出合约地址，记录到 `contracts/deployments/shasta.json`。

将输出的合约地址填入 `.env`:
```
CONTRACT_AGENT_REGISTRY=Txxxxxxxxxxxxx
CONTRACT_REVENUE_SPLITTER=Txxxxxxxxxxxxx
CONTRACT_ESCROW_SERVICE=Txxxxxxxxxxxxx
CONTRACT_MICRO_PAYMENT=Txxxxxxxxxxxxx
```

### 1.4 测试网验证

```bash
pnpm contracts:verify:shasta
```

### 1.5 TRON 主网部署

**前置条件:**
- [ ] 合约已通过安全审计
- [ ] Shasta 测试网全部验证通过
- [ ] 部署账户有至少 500 TRX (含 gas 预留)
- [ ] 多签地址已确认并填入 `.env`
- [ ] Gas 价格已确认

```bash
# 确认 .env 中 PRIVATE_KEY 为主网账户, MULTISIG_ADDRESS 正确
pnpm contracts:deploy:mainnet
```

**部署后步骤:**
1. 验证部署记录: `contracts/deployments/mainnet.json`
2. 更新 `.env` 中 `CONTRACT_*` 地址
3. 执行合约验证: `pnpm contracts:verify:mainnet`
4. 确认 ownership 已转移至多签地址 (在 Tronscan 上检查)
5. 将 `CONTRACT_*` 地址更新到 CI/CD secrets

### 1.6 合约地址 (可查询)

| 网络 | 合约 | 地址 |
|------|------|------|
| Shasta | AgentRegistry | 部署后填入 |
| Shasta | RevenueSplitter | 部署后填入 |
| Shasta | EscrowService | 部署后填入 |
| Shasta | MicroPaymentChannel | 部署后填入 |
| Mainnet | AgentRegistry | 部署后填入 |
| Mainnet | RevenueSplitter | 部署后填入 |
| Mainnet | EscrowService | 部署后填入 |
| Mainnet | MicroPaymentChannel | 部署后填入 |

---

## 二、产品包构建与发布

### 2.1 本地构建

```bash
pnpm install
pnpm build        # 编译所有 TypeScript 包
pnpm test         # 运行所有测试
```

### 2.2 npm 发布

发布到 npm registry:

```bash
pnpm build
pnpm test
pnpm -r publish --access public
```

发布通过 GitHub Actions 自动化: 推送 `v*` 标签触发 `release.yml` 工作流。

### 2.3 CI/CD

GitHub Actions 工作流:

| 工作流 | 触发条件 | 内容 |
|--------|----------|------|
| `ci.yml` | PR → main, push main | lint, build, test, contracts compile, contracts test |
| `release.yml` | tag `v*` | build, test, npm publish, GitHub release |

---

## 三、环境变量参考

完整 `.env` 配置:

```bash
# 部署账户 (用于 Hardhat)
PRIVATE_KEY=

# TRON 节点
TRON_FULL_NODE=https://api.trongrid.io
TRON_SOLIDITY_NODE=https://api.trongrid.io
TRON_EVENT_SERVER=https://api.trongrid.io
TRON_PRIVATE_KEY=
TRON_API_KEY=

# 主网 RPC
TRON_MAINNET_RPC=https://api.trongrid.io

# 合约验证
TRONSCAN_API_KEY=

# 多签 (主网)
MULTISIG_ADDRESS=
INITIAL_OPERATOR=

# 合约地址 (部署后填入)
CONTRACT_AGENT_REGISTRY=
CONTRACT_REVENUE_SPLITTER=
CONTRACT_ESCROW_SERVICE=
CONTRACT_MICRO_PAYMENT=

# 产品 ID
A2A_PAY_PRODUCT_ID=a2a-pay
A2A_MARKET_PRODUCT_ID=a2a-market
A2A_LEND_PRODUCT_ID=a2a-lend

# 数据库路径
DB_PATH=./data
```

---

## 四、运维

### 4.1 合约管理 CLI

```bash
# 查看产品列表和抽成统计
tsx cli/index.ts products --network tron

# 查看 Agent 信息
tsx cli/index.ts agent <did> --network tron

# 提取 RevenueSplitter 中的费用
tsx cli/index.ts withdraw --product a2a-pay --to <address> --network tron

# 健康检查
tsx cli/index.ts health
```

### 4.2 监控

- **链上**: TronScan 查询合约事件
- **产品**: 各包内置 `getTotalPointsIssued()` / `getTotalAUM()` 等聚合查询
- **日志**: 部署在生产环境后使用结构化日志 (建议 Pino/Winston)

### 4.3 升级

合约升级策略:
1. 当前合约不可升级 (非代理模式) — 如需升级需部署新合约并迁移状态
2. 未来版本迁移到 UUPS 代理模式
3. RevenueSplitter 产品参数可通过 `updateProduct` 调整 (owner only)

### 4.4 回滚

如果主网部署有问题:
1. 如未超过 24h 且无用户交互 → 重新部署新合约，更新 `.env` 地址
2. 如有用户交互 → 部署修复合约，创建迁移脚本转移状态

---

## 五、安全审计清单

部署到主网前:

- [ ] 重入攻击防护 — 所有 external 函数遵循 checks-effects-interactions
- [ ] 整数溢出 — Solidity 0.8.x 内建检查
- [ ] 权限控制 — onlyOwner / onlyOperator 修饰符
- [ ] 访问控制 — AgentRegistry 的 DID ownership
- [ ] 资金安全 — EscrowService 的双签释放
- [ ] 签名验证 — MicroPaymentChannel 的 ECDSA 验证
- [ ] 费率上下限 — RevenueSplitter 的 max rate cap
- [ ] 事件完整性 — 所有状态变更发出事件
- [ ] 第三方审计报告 (推荐 Trail of Bits / OpenZeppelin)

---

## 六、故障排查

| 问题 | 解决方案 |
|------|----------|
| `HardhatError: HH22` (网络不通) | 确保 hardhat 本地安装: `cd contracts && pnpm install` |
| 部署 gas 不足 | 增加钱包 TRX 余额或降低 `gasPrice` |
| 验证失败 `Contract source code already verified` | 合约已验证，跳过 |
| Shasta 水龙头不够 | 访问 https://www.trongrid.io/shasta 领取测试币 |
| `TronWeb is not available` | 产品运行在无链环境中，不影响业务逻辑测试 |
