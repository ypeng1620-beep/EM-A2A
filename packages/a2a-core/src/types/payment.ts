/**
 * 支付类型 — x402 A2A Payment Protocol
 */

import type { AgentDID } from './agent.js'

export type PaymentToken = 'USDT' | 'USDC' | 'TRX' | 'ETH' | 'SOL'

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'reverted'

export interface PaymentRequest {
  id: string
  from: AgentDID
  to: AgentDID
  token: PaymentToken
  amount: string // wei 精度的字符串
  memo?: string
  nonce: number
  expiry: number
  signature?: string
}

export interface TxReceipt {
  txHash: string
  blockNumber: number
  from: string
  to: string
  token: PaymentToken
  amount: string
  fee: string
  status: PaymentStatus
  timestamp: number
  chainId: string
}

export interface MicroPaymentChannel {
  channelId: string
  from: AgentDID
  to: AgentDID
  deposit: string
  balance: string
  nonce: number
  openedAt: number
  expiresAt: number
  status: 'open' | 'closing' | 'closed'
}

export interface MicroPayment {
  channelId: string
  amount: string
  nonce: number
  signature: string
}

export type RevenueMode = 'fixed_tier' | 'variable_float'
