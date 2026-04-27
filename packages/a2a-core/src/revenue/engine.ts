/**
 * 抽成引擎 — 统一入口
 *
 * 策略模式：根据产品注册的抽成模式，路由到 FixedTierRevenue 或 VariableFloatRevenue
 */

import type { RevenueMode } from '../types/payment.js'
import type { RevenueResult } from '../types/revenue.js'
import { FixedTierRevenue } from './fixedTier.js'
import { VariableFloatRevenue } from './variableFloat.js'

export interface RevenueEngineConfig {
  mode: RevenueMode
  fixedTierConfig?: ConstructorParameters<typeof FixedTierRevenue>[0]
  variableFloatConfig?: ConstructorParameters<typeof VariableFloatRevenue>[0]
}

export class RevenueEngine {
  private mode: RevenueMode
  private fixedTier: FixedTierRevenue
  private variableFloat: VariableFloatRevenue

  constructor(config: RevenueEngineConfig) {
    this.mode = config.mode
    this.fixedTier = new FixedTierRevenue(config.fixedTierConfig)
    this.variableFloat = new VariableFloatRevenue(config.variableFloatConfig)
  }

  calculateFee(
    amount: string,
    options?: {
      riskScore?: number
      creditScore?: number
      transactionType?: string
    },
  ): RevenueResult {
    if (this.mode === 'fixed_tier') {
      const result = this.fixedTier.calculateFee(amount)
      this.fixedTier.addVolume(amount)
      return result
    }

    return this.variableFloat.calculateFee(
      amount,
      options?.riskScore ?? 50,
      options?.creditScore ?? 700,
      options?.transactionType ?? 'standard',
    )
  }

  getMode(): RevenueMode {
    return this.mode
  }

  setMode(mode: RevenueMode): void {
    this.mode = mode
  }
}
