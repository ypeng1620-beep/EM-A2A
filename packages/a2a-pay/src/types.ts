import type { AgentDID, TxReceipt, RevenueMode } from '@poisonpyf/a2a-core'

export interface A2APayConfig {
  productId: string
  revenueMode: RevenueMode
  fixedTierRates?: number[]
  variableFloatBaseRate?: number
  supportedTokens: ('USDT' | 'USDC')[]
}

export interface TransferParams {
  from: AgentDID
  to: AgentDID
  token: 'USDT' | 'USDC'
  amount: string
  memo?: string
  transactionType?: string
}

export interface TransferResult {
  success: boolean
  receipt?: TxReceipt
  fee: string
  feeRate: number
  netAmount: string
  error?: string
}
