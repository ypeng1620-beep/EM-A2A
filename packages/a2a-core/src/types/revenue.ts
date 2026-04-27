/**
 * 抽成配置类型
 */

export interface FixedTierConfig {
  mode: 'fixed_tier'
  tiers: TierRule[]
  currentTier: number
}

export interface TierRule {
  monthlyVolumeUSD: number
  rate: number
}

export interface VariableFloatConfig {
  mode: 'variable_float'
  baseRate: number
  riskMultiplier: Range
  creditMultiplier: Range
  typeMultiplier: Record<string, number>
  minRate: number
  maxRate: number
}

export interface Range {
  min: number
  max: number
}

export type RevenueConfig = FixedTierConfig | VariableFloatConfig

export interface RevenueResult {
  amount: string
  fee: string
  rate: number
  mode: 'fixed_tier' | 'variable_float'
  tier?: number
}
