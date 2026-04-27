/**
 * A2A Invest — AI 投顾 & 组合管理
 *
 * 对标蚂蚁财富：
 *   1. 风险测评问卷 → RiskProfile
 *   2. 组合创建 & 管理（多资产配置）
 *   3. 策略推荐（基于风险画像 + 金额）
 *   4. 组合再平衡 & 绩效追踪
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskProfile = 'conservative' | 'moderate' | 'balanced' | 'growth' | 'aggressive'

export interface PortfolioAsset {
  token: string
  allocation: number       // 0–1, sum must be 1
  amount: string
  apy: number
}

export interface Portfolio {
  id: string
  agentId: string
  name: string
  riskProfile: RiskProfile
  assets: PortfolioAsset[]
  totalValue: string
  status: 'active' | 'closed'
  createdAt: number
  updatedAt: number
  accruedReturn: string
}

export interface InvestmentStrategy {
  type: string
  name: string
  description: string
  riskProfile: RiskProfile
  expectedReturn: number     // APY
  volatility: number         // std dev
  minInvestment: string
  assetAllocation: { token: string; allocation: number }[]
}

export interface Recommendation {
  strategy: InvestmentStrategy
  confidence: number         // 0–1
  reasoning: string
}

export interface A2AInvestConfig {
  managementFee?: number     // 0.01 = 1%/yr
}

// ---------------------------------------------------------------------------
// Default strategies
// ---------------------------------------------------------------------------

const DEFAULT_STRATEGIES: InvestmentStrategy[] = [
  {
    type: 'stable_income',
    name: '稳定收益',
    description: '低风险稳定币生息，适合保守型投资者',
    riskProfile: 'conservative',
    expectedReturn: 0.04,
    volatility: 0.01,
    minInvestment: '10000000',
    assetAllocation: [
      { token: 'USDC', allocation: 0.7 },
      { token: 'USDT', allocation: 0.3 },
    ],
  },
  {
    type: 'income_plus',
    name: '收益增强',
    description: '以稳定币为主 + 少量 DeFi 蓝筹，适度增厚收益',
    riskProfile: 'moderate',
    expectedReturn: 0.08,
    volatility: 0.05,
    minInvestment: '50000000',
    assetAllocation: [
      { token: 'USDC', allocation: 0.5 },
      { token: 'USDT', allocation: 0.3 },
      { token: 'ETH', allocation: 0.2 },
    ],
  },
  {
    type: 'balanced_growth',
    name: '均衡成长',
    description: '股债平衡配置，兼顾收益与风险',
    riskProfile: 'balanced',
    expectedReturn: 0.14,
    volatility: 0.15,
    minInvestment: '100000000',
    assetAllocation: [
      { token: 'USDC', allocation: 0.3 },
      { token: 'ETH', allocation: 0.4 },
      { token: 'BTC', allocation: 0.3 },
    ],
  },
  {
    type: 'growth',
    name: '成长进取',
    description: '偏向高成长资产，适合承受中等波动的投资者',
    riskProfile: 'growth',
    expectedReturn: 0.22,
    volatility: 0.30,
    minInvestment: '200000000',
    assetAllocation: [
      { token: 'ETH', allocation: 0.5 },
      { token: 'BTC', allocation: 0.3 },
      { token: 'TRX', allocation: 0.2 },
    ],
  },
  {
    type: 'alpha_hunting',
    name: 'Alpha 猎手',
    description: '高波动高回报，聚焦新兴代币和 DeFi 协议',
    riskProfile: 'aggressive',
    expectedReturn: 0.40,
    volatility: 0.55,
    minInvestment: '500000000',
    assetAllocation: [
      { token: 'ETH', allocation: 0.4 },
      { token: 'BTC', allocation: 0.2 },
      { token: 'TRX', allocation: 0.25 },
      { token: 'DeFi', allocation: 0.15 },
    ],
  },
]

// Risk questionnaire — 5 questions, each answer scores 1-5
const RISK_QUESTIONS = [
  {
    id: 'time_horizon',
    text: '你的投资期限是多久？',
    options: [
      { text: '少于 3 个月', score: 1 },
      { text: '3–12 个月', score: 2 },
      { text: '1–3 年', score: 3 },
      { text: '3–10 年', score: 4 },
      { text: '超过 10 年', score: 5 },
    ],
  },
  {
    id: 'loss_tolerance',
    text: '你能承受多大的短期亏损？',
    options: [
      { text: '不能接受任何亏损', score: 1 },
      { text: '最多 5%', score: 2 },
      { text: '最多 15%', score: 3 },
      { text: '最多 30%', score: 4 },
      { text: '超过 30% 也可以', score: 5 },
    ],
  },
  {
    id: 'income_stability',
    text: '你的 Agent 收入稳定性如何？',
    options: [
      { text: '极不稳定，波动巨大', score: 1 },
      { text: '不太稳定', score: 2 },
      { text: '基本稳定', score: 3 },
      { text: '比较稳定', score: 4 },
      { text: '非常稳定，持续增长', score: 5 },
    ],
  },
  {
    id: 'knowledge',
    text: '你对 DeFi 和加密资产的了解程度？',
    options: [
      { text: '完全不了解', score: 1 },
      { text: '听说过一些', score: 2 },
      { text: '有一定的了解', score: 3 },
      { text: '比较了解', score: 4 },
      { text: '非常了解，经常参与', score: 5 },
    ],
  },
  {
    id: 'goal',
    text: '你的投资目标是什么？',
    options: [
      { text: '保本就行', score: 1 },
      { text: '跑赢通胀即可', score: 2 },
      { text: '稳健增值', score: 3 },
      { text: '追求较高回报', score: 4 },
      { text: '追求最大化回报', score: 5 },
    ],
  },
]

// ---------------------------------------------------------------------------
// BigInt helpers
// ---------------------------------------------------------------------------

function bigAdd(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString()
}

function bigMulRatio(amount: string, ratio: number): string {
  // Use 1e9 precision (safe within MAX_SAFE_INTEGER)
  return (BigInt(amount) * BigInt(Math.round(ratio * 1_000_000_000)) / 1_000_000_000n).toString()
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** 5–25 total → RiskProfile */
function scoreToProfile(totalScore: number): RiskProfile {
  if (totalScore <= 8) return 'conservative'
  if (totalScore <= 12) return 'moderate'
  if (totalScore <= 16) return 'balanced'
  if (totalScore <= 20) return 'growth'
  return 'aggressive'
}

// ---------------------------------------------------------------------------
// A2A Invest
// ---------------------------------------------------------------------------

export class A2AInvest {
  private portfolios: Map<string, Portfolio>
  private strategies: InvestmentStrategy[]
  private managementFee: number

  constructor(config: A2AInvestConfig = {}) {
    this.portfolios = new Map()
    this.strategies = [...DEFAULT_STRATEGIES]
    this.managementFee = config.managementFee ?? 0.01
  }

  // =========================================================================
  // Risk Assessment
  // =========================================================================

  /** 根据答案数组进行风险测评，answers 为 5 个问题的索引答案 (0-4) */
  assessRisk(answers: number[]): { profile: RiskProfile; score: number } {
    if (answers.length !== 5) {
      throw new Error('Must answer all 5 questions')
    }
    const totalScore = answers.reduce((sum, ans, i) => {
      if (ans < 0 || ans >= RISK_QUESTIONS[i].options.length) {
        throw new Error(`Invalid answer for question ${i + 1}: ${ans}`)
      }
      return sum + RISK_QUESTIONS[i].options[ans].score
    }, 0)

    return { profile: scoreToProfile(totalScore), score: totalScore }
  }

  static getQuestionnaire() {
    return RISK_QUESTIONS
  }

  // =========================================================================
  // Portfolio Management
  // =========================================================================

  createPortfolio(params: {
    agentId: string
    name: string
    assets: { token: string; allocation: number; amount: string; apy: number }[]
  }): Portfolio {
    if (params.assets.length === 0) {
      throw new Error('Portfolio must have at least one asset')
    }

    const allocSum = params.assets.reduce((s, a) => s + a.allocation, 0)
    if (Math.abs(allocSum - 1) > 0.001) {
      throw new Error(`Asset allocations must sum to 1, got ${allocSum}`)
    }

    const totalValue = params.assets.reduce((sum, a) => bigAdd(sum, a.amount), '0')
    // Derive risk profile from weighted APY
    const avgApy = params.assets.reduce((s, a) => s + a.allocation * a.apy, 0)
    const riskProfile = this.apyToProfile(avgApy)

    const portfolio: Portfolio = {
      id: `port_${randomUUID().slice(0, 8)}`,
      agentId: params.agentId,
      name: params.name,
      riskProfile,
      assets: params.assets.map(a => ({ ...a })),
      totalValue,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accruedReturn: '0',
    }

    this.portfolios.set(portfolio.id, portfolio)
    return portfolio
  }

  rebalancePortfolio(portfolioId: string, newAllocations: { token: string; allocation: number }[]): Portfolio {
    const port = this.mustGet(portfolioId)
    if (port.status !== 'active') {
      throw new Error('Cannot rebalance a closed portfolio')
    }

    const allocSum = newAllocations.reduce((s, a) => s + a.allocation, 0)
    if (Math.abs(allocSum - 1) > 0.001) {
      throw new Error(`Allocations must sum to 1, got ${allocSum}`)
    }

    // Distribute totalValue across new allocations
    const newAssets: PortfolioAsset[] = newAllocations.map(alloc => {
      const existing = port.assets.find(a => a.token === alloc.token)
      const apy = existing?.apy ?? 0.05
      const amount = bigMulRatio(port.totalValue, alloc.allocation)
      return { token: alloc.token, allocation: alloc.allocation, amount, apy }
    })

    port.assets = newAssets
    port.updatedAt = Date.now()
    return port
  }

  closePortfolio(portfolioId: string): Portfolio {
    const port = this.mustGet(portfolioId)
    if (port.status !== 'active') {
      throw new Error('Portfolio is not active')
    }
    port.status = 'closed'
    port.updatedAt = Date.now()
    return port
  }

  // =========================================================================
  // Accrual & Performance
  // =========================================================================

  /** 按持有时间累积收益 */
  accrueReturn(portfolioId: string): string {
    const port = this.mustGet(portfolioId)
    if (port.status !== 'active') return '0'

    const elapsedMs = Date.now() - port.updatedAt
    const elapsedYears = elapsedMs / (365 * 86400_000)

    let totalReturn = '0'
    for (const asset of port.assets) {
      const grossReturn = bigMulRatio(asset.amount, asset.apy * elapsedYears)
      const mgmtFee = bigMulRatio(grossReturn, this.managementFee)
      const grossBI = BigInt(grossReturn)
      const feeBI = BigInt(mgmtFee)
      totalReturn = (BigInt(totalReturn) + (grossBI > feeBI ? grossBI - feeBI : 0n)).toString()
    }

    port.accruedReturn = bigAdd(port.accruedReturn, totalReturn)
    port.totalValue = bigAdd(port.totalValue, totalReturn)
    port.updatedAt = Date.now()

    return totalReturn
  }

  /** 预估指定天数后的收益 */
  projectReturn(portfolioId: string, days: number): string {
    const port = this.mustGet(portfolioId)
    const years = days / 365

    let totalReturn = '0'
    for (const asset of port.assets) {
      const grossReturn = bigMulRatio(asset.amount, asset.apy * years)
      const mgmtFee = bigMulRatio(grossReturn, this.managementFee)
      const netReturn = (BigInt(grossReturn) - BigInt(mgmtFee)).toString()
      totalReturn = (BigInt(totalReturn) + BigInt(netReturn.startsWith('-') ? '0' : netReturn)).toString()
    }
    return totalReturn
  }

  // =========================================================================
  // Recommendations
  // =========================================================================

  getRecommendations(riskProfile: RiskProfile, amount: string): Recommendation[] {
    const eligible = this.strategies.filter(
      s => s.riskProfile === riskProfile && BigInt(amount) >= BigInt(s.minInvestment),
    )

    return eligible.map(s => ({
      strategy: s,
      confidence: this.calcConfidence(s, riskProfile),
      reasoning: this.buildReasoning(s, amount),
    }))
  }

  addStrategy(strategy: InvestmentStrategy): void {
    const idx = this.strategies.findIndex(s => s.type === strategy.type)
    if (idx >= 0) {
      this.strategies[idx] = strategy
    } else {
      this.strategies.push(strategy)
    }
  }

  getStrategies(): InvestmentStrategy[] {
    return [...this.strategies]
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getPortfolio(portfolioId: string): Portfolio | null {
    return this.portfolios.get(portfolioId) ?? null
  }

  getAgentPortfolios(agentId: string, status?: 'active' | 'closed'): Portfolio[] {
    const all = [...this.portfolios.values()].filter(p => p.agentId === agentId)
    return status ? all.filter(p => p.status === status) : all
  }

  getTotalAUM(): string {
    let total = '0'
    for (const p of this.portfolios.values()) {
      if (p.status === 'active') {
        total = bigAdd(total, p.totalValue)
      }
    }
    return total
  }

  getAgentAUM(agentId: string): string {
    let total = '0'
    for (const p of this.portfolios.values()) {
      if (p.agentId === agentId && p.status === 'active') {
        total = bigAdd(total, p.totalValue)
      }
    }
    return total
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private apyToProfile(apy: number): RiskProfile {
    if (apy <= 0.06) return 'conservative'
    if (apy <= 0.10) return 'moderate'
    if (apy <= 0.16) return 'balanced'
    if (apy <= 0.25) return 'growth'
    return 'aggressive'
  }

  private calcConfidence(strategy: InvestmentStrategy, profile: RiskProfile): number {
    const order: RiskProfile[] = ['conservative', 'moderate', 'balanced', 'growth', 'aggressive']
    const dist = Math.abs(order.indexOf(strategy.riskProfile) - order.indexOf(profile))
    return Math.max(0, 1 - dist * 0.2)
  }

  private buildReasoning(strategy: InvestmentStrategy, amount: string): string {
    const amtNum = Number(BigInt(amount)) / 1e6
    if (BigInt(amount) < BigInt(strategy.minInvestment)) {
      return `金额不足，该策略最低要求 ${Number(BigInt(strategy.minInvestment)) / 1e6} USDC`
    }
    return `基于你的风险画像 (${strategy.riskProfile})，推荐「${strategy.name}」：预期年化 ${(strategy.expectedReturn * 100).toFixed(0)}%，波动率 ${(strategy.volatility * 100).toFixed(0)}%。投资 ${amtNum.toFixed(2)} USDC。`
  }

  private mustGet(portfolioId: string): Portfolio {
    const p = this.portfolios.get(portfolioId)
    if (!p) throw new Error(`Portfolio not found: ${portfolioId}`)
    return p
  }
}

export default A2AInvest
