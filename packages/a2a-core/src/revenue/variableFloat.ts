/**
 * 可变浮动抽成模型
 *
 * finalRate = baseRate × riskFactor × creditFactor × typeFactor
 * fee = amount × clamp(finalRate, minRate, maxRate)
 */

import type { VariableFloatConfig, RevenueResult } from '../types/revenue.js'

export const DEFAULT_VARIABLE_CONFIG: VariableFloatConfig = {
  mode: 'variable_float',
  baseRate: 0.01,
  riskMultiplier: { min: 0.5, max: 3.0 },
  creditMultiplier: { min: 0.3, max: 1.5 },
  typeMultiplier: {
    standard: 1.0,
    high_value: 0.8,
    micro: 1.5,
    urgent: 2.0,
  },
  minRate: 0.002,
  maxRate: 0.05,
}

export class VariableFloatRevenue {
  private config: VariableFloatConfig

  constructor(config: Partial<VariableFloatConfig> = {}) {
    this.config = { ...DEFAULT_VARIABLE_CONFIG, ...config }
  }

  calculateFee(
    amount: string,
    riskScore: number,
    creditScore: number,
    transactionType: string = 'standard',
  ): RevenueResult {
    const riskFactor = this.normalizeRiskFactor(riskScore)
    const creditFactor = this.normalizeCreditFactor(creditScore)
    const typeFactor = this.config.typeMultiplier[transactionType] ?? 1.0

    let rate = this.config.baseRate * riskFactor * creditFactor * typeFactor
    rate = Math.max(this.config.minRate, Math.min(this.config.maxRate, rate))

    const amountBN = BigInt(amount)
    const rateBPS = BigInt(Math.floor(rate * 10000))
    const fee = (amountBN * rateBPS) / 10000n

    return {
      amount,
      fee: fee.toString(),
      rate,
      mode: 'variable_float',
    }
  }

  private normalizeRiskFactor(riskScore: number): number {
    // riskScore: 0 (safe) → 100 (high risk)
    const normalized = riskScore / 100
    return this.config.riskMultiplier.min +
      normalized * (this.config.riskMultiplier.max - this.config.riskMultiplier.min)
  }

  private normalizeCreditFactor(creditScore: number): number {
    // creditScore: 300 → 950
    // Higher credit → lower factor
    const normalized = (creditScore - 300) / 650
    return this.config.creditMultiplier.max -
      normalized * (this.config.creditMultiplier.max - this.config.creditMultiplier.min)
  }

  getConfig(): VariableFloatConfig {
    return { ...this.config }
  }
}
