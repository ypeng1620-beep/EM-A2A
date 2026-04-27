# Revenue Model — 双重抽成引擎

## 模式 A: 固定级差 (Fixed Tier)

```typescript
interface FixedTierConfig {
  mode: 'fixed_tier'
  tiers: TierRule[]
}

interface TierRule {
  monthlyVolumeUSD: number   // 月流水阈值
  rate: number               // 费率 (0.005 = 0.5%)
}

// 默认阶梯
const DEFAULT_TIERS: TierRule[] = [
  { monthlyVolumeUSD: 0,      rate: 0.01  },  // 基础 1%
  { monthlyVolumeUSD: 10000,  rate: 0.008 },  // $10k+ → 0.8%
  { monthlyVolumeUSD: 100000, rate: 0.005 },  // $100k+ → 0.5%
]
```

## 模式 B: 可变浮动 (Variable Float)

```typescript
interface VariableFloatConfig {
  mode: 'variable_float'
  baseRate: number           // 基础费率
  riskMultiplier: Range      // 风险系数范围
  creditMultiplier: Range    // 信用系数范围
  typeMultiplier: Record<string, number>  // 交易类型系数
}

// 计算公式
// finalRate = baseRate × riskFactor × creditFactor × typeFactor
// fee = amount × clamp(finalRate, minRate, maxRate)

// 风险因子 (由 Compliance 引擎评估)
// 0.5 — 低风险 (KYC 完整、历史清白)
// 1.0 — 正常风险
// 3.0 — 高风险 (新注册、异常行为)

// 信用因子
// 0.3 — 信用 ≥ 900 (极优)
// 0.6 — 信用 700-899 (良好)
// 1.0 — 信用 500-699 (一般)
// 1.5 — 信用 < 500 (差)
```

## 链上实现 (RevenueSplitter.sol)

```solidity
function calculateFee(
    uint256 amount,
    bytes32 productId,
    bytes32 agentId
) public view returns (uint256 fee, uint256 rate) {
    ProductConfig memory config = products[productId];
    
    if (config.mode == Mode.FIXED_TIER) {
        rate = getTierRate(productId, config.monthlyVolume);
    } else {
        uint256 risk = getRiskFactor(agentId);
        uint256 credit = getCreditFactor(agentId);
        rate = config.baseRate * risk * credit / 1e4;
    }
    
    fee = amount * rate / 1e4;
    return (fee, rate);
}
```

## 收入分配

```
交易金额 $100
  ├── 抽成 $1 (1%)
  │   ├── 平台收入 70% ($0.70)
  │   ├── 运营储备 20% ($0.20)
  │   └── 生态基金 10% ($0.10)
  └── 净支付 $99 → 收款方
```
