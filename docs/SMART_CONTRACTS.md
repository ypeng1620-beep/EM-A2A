# EM-A2A 智能合约设计

## 合约清单

| 合约 | 功能 | 抽成关系 |
|------|------|---------|
| `RevenueSplitter.sol` | 双模式抽成引擎 | 核心 — 所有产品调用 |
| `EscrowService.sol` | 服务托管支付 | 托管 → 验收 → 释放 (含抽成) |
| `AgentRegistry.sol` | Agent DID 注册 | 注册费 |
| `CreditScoreOracle.sol` | 信用分预言机 | 查询费 |
| `MicroPaymentChannel.sol` | 微支付批量通道 | 批量结算，节省 Gas |
| `ServiceBond.sol` | 服务质押保险 | 保费 + 理赔 |

## Contract: RevenueSplitter.sol

```
核心功能:
  registerProduct(productId, mode, config)   — 注册产品抽成配置
  setTierRate(productId, volume, rate)       — 设置阶梯费率
  calculateFee(productId, agentId, amount)   — 计算抽成 (view)
  executeTransaction(from, to, productId, amount, extra) — 执行抽成交易
  withdrawFees(productId, to)                — 提取累计抽成
  getProductStats(productId)                 — 产品统计 (view)

双模式选择:
  Mode.FIXED_TIER   — 固定级差 (月流水阶梯)
  Mode.VARIABLE_FLOAT — 可变浮动 (风险×信用×类型)
```

## Contract: EscrowService.sol

```
核心功能:
  createOrder(serviceId, agentId, amount, deadline) — 创建订单
  confirmDelivery(orderId)                           — Agent 确认交付
  acceptDelivery(orderId)                            — 买方验收
  dispute(orderId, reason)                           — 发起争议
  resolveDispute(orderId, resolution)                — 仲裁 (DAO)
  releaseFunds(orderId)                              — 释放资金 (含抽成)

状态机:
  PENDING → FUNDED → DELIVERED → ACCEPTED → RELEASED
                          ↓
                      DISPUTED → RESOLVED → RELEASED/REFUNDED
```

## Contract: AgentRegistry.sol

```
核心功能:
  registerAgent(metadata)     — 注册 Agent DID (NFT 721/1155)
  updateMetadata(did, data)   — 更新元数据
  issueCredential(did, cred)  — 发行资质 SBT
  revokeCredential(did, cred) — 吊销资质
  resolveDID(did)             — 解析 DID → 身份信息 (view)
  isActive(did)               — 检查 Agent 是否活跃 (view)
```

## Contract: MicroPaymentChannel.sol

```
核心功能:
  openChannel(from, to, deposit)     — 开通微支付通道
  updateState(from, to, payment)     — 链下更新状态 (签名)
  closeChannel(from, to, finalState) — 关闭通道 + 批量结算
  disputeChannel(from, to, states)   — 争议处理

节省 Gas 策略:
  - 链下累计 100 笔小额支付
  - 链上一次性结算
  - 单笔微支付成本 < $0.001
```

## 部署方案

```
测试网 (Shasta):
  RevenueSplitter    → deploy + register 4 P0 products
  AgentRegistry       → deploy
  EscrowService       → deploy (依赖 RevenueSplitter)
  MicroPaymentChannel → deploy

主网 (TRON):
  上述全部 + CreditScoreOracle + ServiceBond
```

## 安全措施

- OpenZeppelin 合约库 (Ownable, ReentrancyGuard, Pausable)
- 所有费率变更须多签 (3/5)
- 合约升级使用 UUPS Proxy 模式
- 完整的测试覆盖 (Hardhat + Foundry)
- 第三方审计 (CertiK / Trail of Bits — P1 阶段)
