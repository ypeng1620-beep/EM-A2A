/**
 * 固定级差抽成模型
 *
 * 月流水达标自动降费：
 *   < $10k   → 1%
 *   $10k-$100k → 0.8%
 *   > $100k  → 0.5%
 */

import type { FixedTierConfig, RevenueResult } from '../types/revenue.js'

export const DEFAULT_FIXED_TIERS: FixedTierConfig = {
  mode: 'fixed_tier',
  tiers: [
    { monthlyVolumeUSD: 0, rate: 0.01 },
    { monthlyVolumeUSD: 10_000, rate: 0.008 },
    { monthlyVolumeUSD: 100_000, rate: 0.005 },
  ],
  currentTier: 0,
}

export class FixedTierRevenue {
  private config: FixedTierConfig
  private monthlyVolume: number = 0

  constructor(config: Partial<FixedTierConfig> = {}) {
    this.config = {
      mode: 'fixed_tier',
      tiers: config.tiers ?? DEFAULT_FIXED_TIERS.tiers,
      currentTier: 0,
    }
  }

  calculateFee(amount: string): RevenueResult {
    const amountBN = BigInt(amount)
    const tier = this.getCurrentTier()
    const rate = this.config.tiers[tier].rate
    const fee = (amountBN * BigInt(Math.floor(rate * 10000))) / 10000n

    return {
      amount,
      fee: fee.toString(),
      rate,
      mode: 'fixed_tier',
      tier,
    }
  }

  addVolume(amount: string): void {
    const amountUSD = Number(amount) / 1e6 // USDC 6 decimal
    this.monthlyVolume += amountUSD
    this.config.currentTier = this.calculateTier()
  }

  private getCurrentTier(): number {
    return this.config.currentTier
  }

  private calculateTier(): number {
    let tier = 0
    for (let i = 0; i < this.config.tiers.length; i++) {
      if (this.monthlyVolume >= this.config.tiers[i].monthlyVolumeUSD) {
        tier = i
      }
    }
    return tier
  }

  getConfig(): FixedTierConfig {
    return { ...this.config, currentTier: this.calculateTier() }
  }
}
