/**
 * A2A Earn — Agent Yield & Treasury Management
 *
 * Idle-fund auto-yield with multi-strategy routing.
 * Management fee 1%/year + 20% excess profit share above benchmark.
 *
 * Strategies (simulated):
 *   conservative — stable yield ~5% APY
 *   balanced    — moderate yield ~10% APY
 *   aggressive  — high yield ~18% APY
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrategyType = 'conservative' | 'balanced' | 'aggressive'

export interface YieldStrategy {
  type: StrategyType
  name: string
  apy: number       // e.g. 0.10 = 10% APY
  risk: 'low' | 'medium' | 'high'
  minDeposit: string
}

export interface Position {
  id: string
  agentId: string
  amount: string
  currency: string
  strategy: StrategyType
  apy: number
  depositedAt: number
  accruedYield: string
  lastAccrualAt: number
  status: 'active' | 'redeemed'
  redeemedAt: number | null
}

export interface YieldEntry {
  id: string
  positionId: string
  amount: string
  timestamp: number
  apy: number
}

export interface A2AEarnConfig {
  managementFee?: number  // annual, e.g. 0.01 = 1%
  excessShare?: number    // above benchmark, e.g. 0.20 = 20%
  benchmarkApy?: number
}

// ---------------------------------------------------------------------------
// Default strategies
// ---------------------------------------------------------------------------

const DEFAULT_STRATEGIES: Record<StrategyType, YieldStrategy> = {
  conservative: { type: 'conservative', name: 'Treasury Ladder', apy: 0.05, risk: 'low', minDeposit: '10000000' },
  balanced:     { type: 'balanced',     name: 'DeFi Liquidity',  apy: 0.10, risk: 'medium', minDeposit: '50000000' },
  aggressive:   { type: 'aggressive',   name: 'Alpha Vault',     apy: 0.18, risk: 'high',   minDeposit: '100000000' },
}

// ---------------------------------------------------------------------------
// BigInt helpers
// ---------------------------------------------------------------------------

function bigAdd(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString()
}

function bigSub(a: string, b: string): string {
  const result = BigInt(a) - BigInt(b)
  return result < 0n ? '0' : result.toString()
}

function bigMulRatio(amount: string, ratio: number): string {
  return (BigInt(amount) * BigInt(Math.round(ratio * 1_000_000)) / 1_000_000n).toString()
}

/** 1e18 precision ratio multiply */
function bigMulRatio18(amount: string, ratio: number): string {
  return (BigInt(amount) * BigInt(Math.round(ratio * 1e18)) / BigInt(1e18)).toString()
}

// ---------------------------------------------------------------------------
// A2A Earn
// ---------------------------------------------------------------------------

export class A2AEarn {
  private positions: Map<string, Position>
  private yields: Map<string, YieldEntry[]>
  private strategies: Map<StrategyType, YieldStrategy>
  private managementFee: number
  private excessShare: number
  private benchmarkApy: number

  constructor(config: A2AEarnConfig = {}) {
    this.positions = new Map()
    this.yields = new Map()
    this.strategies = new Map()

    for (const [k, v] of Object.entries(DEFAULT_STRATEGIES)) {
      this.strategies.set(k as StrategyType, { ...v })
    }

    this.managementFee = config.managementFee ?? 0.01
    this.excessShare = config.excessShare ?? 0.20
    this.benchmarkApy = config.benchmarkApy ?? 0.04
  }

  // =========================================================================
  // Strategies
  // =========================================================================

  getStrategies(): YieldStrategy[] {
    return [...this.strategies.values()]
  }

  getStrategy(type: StrategyType): YieldStrategy | undefined {
    return this.strategies.get(type)
  }

  /** Add or override a strategy. */
  addStrategy(s: YieldStrategy): void {
    this.strategies.set(s.type, { ...s })
  }

  // =========================================================================
  // Deposit
  // =========================================================================

  deposit(agentId: string, amount: string, currency: string, strategyType: StrategyType): Position {
    const strategy = this.strategies.get(strategyType)
    if (!strategy) throw new Error(`Unknown strategy: ${strategyType}`)

    if (BigInt(amount) < BigInt(strategy.minDeposit)) {
      throw new Error(`Deposit below minimum ${strategy.minDeposit} for ${strategyType}`)
    }

    const position: Position = {
      id: `pos_${randomUUID().slice(0, 8)}`,
      agentId,
      amount,
      currency,
      strategy: strategyType,
      apy: strategy.apy,
      depositedAt: Date.now(),
      accruedYield: '0',
      lastAccrualAt: Date.now(),
      status: 'active',
      redeemedAt: null,
    }

    this.positions.set(position.id, position)
    return position
  }

  // =========================================================================
  // Yield Accrual
  // =========================================================================

  /** Accrue yield since last accrual. Returns the newly accrued amount. */
  accrue(positionId: string): string {
    const pos = this.mustGetPos(positionId)
    if (pos.status !== 'active') return '0'

    const now = Date.now()
    const elapsedMs = now - pos.lastAccrualAt
    if (elapsedMs <= 0) return '0'

    // APY per second: (1 + APY) ^ (elapsed / year) - 1
    // Approximate for small time periods: principal * APY * (elapsed / yearInMs)
    const yearInMs = 365.25 * 86400_000
    const elapsedYears = elapsedMs / yearInMs

    const grossYield = bigMulRatio18(pos.amount, pos.apy * elapsedYears)
    const mgmtFee = bigMulRatio18(grossYield, this.managementFee)

    // Excess profit share: if strategy APY > benchmark, charge extra on the excess portion
    let excessFee = '0'
    if (pos.apy > this.benchmarkApy) {
      const excessApy = pos.apy - this.benchmarkApy
      const excessYield = bigMulRatio18(pos.amount, excessApy * elapsedYears)
      excessFee = bigMulRatio18(excessYield, this.excessShare)
    }

    const netYield = bigSub(bigSub(grossYield, mgmtFee), excessFee)

    pos.accruedYield = bigAdd(pos.accruedYield, netYield)
    pos.lastAccrualAt = now

    const entry: YieldEntry = {
      id: `yield_${randomUUID().slice(0, 8)}`,
      positionId,
      amount: netYield,
      timestamp: now,
      apy: pos.apy,
    }

    const entries = this.yields.get(positionId) ?? []
    entries.push(entry)
    this.yields.set(positionId, entries)

    return netYield
  }

  /** Accrue all active positions for an agent. */
  accrueAll(agentId: string): string {
    let total = 0n
    for (const pos of this.positions.values()) {
      if (pos.agentId === agentId && pos.status === 'active') {
        total += BigInt(this.accrue(pos.id))
      }
    }
    return total.toString()
  }

  // =========================================================================
  // Redemption
  // =========================================================================

  redeem(positionId: string): Position {
    const pos = this.mustGetPos(positionId)
    if (pos.status !== 'active') throw new Error('Position not active')

    this.accrue(positionId)

    pos.status = 'redeemed'
    pos.redeemedAt = Date.now()
    return pos
  }

  /** Total redeemable amount (principal + yield). */
  getRedeemableAmount(positionId: string): string {
    const pos = this.mustGetPos(positionId)
    return bigAdd(pos.amount, pos.accruedYield)
  }

  /** Simulate projected yield over N days (does not modify state). */
  projectYield(positionId: string, days: number): string {
    const pos = this.mustGetPos(positionId)
    const yearsFraction = days / 365.25
    return bigMulRatio18(pos.amount, pos.apy * yearsFraction)
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getPosition(positionId: string): Position | null {
    return this.positions.get(positionId) ?? null
  }

  getAgentPositions(agentId: string, status?: 'active' | 'redeemed'): Position[] {
    const all = [...this.positions.values()].filter(p => p.agentId === agentId)
    return status ? all.filter(p => p.status === status) : all
  }

  getYieldHistory(positionId: string): YieldEntry[] {
    return this.yields.get(positionId) ?? []
  }

  /** Total value locked across all active positions. */
  getTVL(): string {
    let total = 0n
    for (const p of this.positions.values()) {
      if (p.status === 'active') total += BigInt(p.amount)
    }
    return total.toString()
  }

  /** Agent's total portfolio value (principal + all accrued yield). */
  getAgentPortfolioValue(agentId: string): string {
    let total = 0n
    for (const pos of this.positions.values()) {
      if (pos.agentId === agentId && pos.status === 'active') {
        total += BigInt(bigAdd(pos.amount, pos.accruedYield))
      }
    }
    return total.toString()
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private mustGetPos(positionId: string): Position {
    const pos = this.positions.get(positionId)
    if (!pos) throw new Error(`Position not found: ${positionId}`)
    return pos
  }
}

export default A2AEarn
