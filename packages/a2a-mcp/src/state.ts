/**
 * EM-A2A MCP Server — State Management
 *
 * 内存状态管理，和现有产品架构一致。
 * 生产环境可替换为 SQLite 或 TRON 链上状态。
 */

import { A2APay, type A2APayConfig } from '@poisonpyf/a2a-pay'
import { A2ACredit } from '@poisonpyf/a2a-credit'
import { A2AID, type A2AIDConfig } from '@poisonpyf/a2a-id'
import { RevenueEngine, generateDID, parseDID } from '@poisonpyf/a2a-core'
import type { RevenueMode, RevenueResult } from '@poisonpyf/a2a-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentState {
  did: string
  address: string
  kyaVerified: boolean
  credentials: string[]
  createdAt: number
}

export interface EscrowState {
  id: string
  from: string
  to: string
  amount: string
  token: string
  status: 'locked' | 'released' | 'refunded'
  lockedAt: number
  releasedAt?: number
  txHash?: string
}

export interface AppState {
  network: string
  agents: Map<string, AgentState>
  escrows: Map<string, EscrowState>
}

// ---------------------------------------------------------------------------
// Global state (单例)
// ---------------------------------------------------------------------------

let state: AppState = {
  network: process.env.A2A_NETWORK || 'mainnet',
  agents: new Map(),
  escrows: new Map(),
}

export function getState(): AppState {
  return state
}

export function resetState(): void {
  state = {
    network: process.env.A2A_NETWORK || 'mainnet',
    agents: new Map(),
    escrows: new Map(),
  }
}

// ---------------------------------------------------------------------------
// Lazy service instances
// ---------------------------------------------------------------------------

let _pay: A2APay | null = null
let _credit: A2ACredit | null = null
let _id: A2AID | null = null
let _revenue: RevenueEngine | null = null

const PAY_CONFIG: A2APayConfig = {
  productId: 'a2a-pay',
  revenueMode: 'fixed_tier',
  supportedTokens: ['USDC', 'USDT'],
}

export function getPay(): A2APay {
  if (!_pay) _pay = new A2APay(PAY_CONFIG)
  return _pay
}

export function getCredit(): A2ACredit {
  if (!_credit) _credit = new A2ACredit()
  return _credit
}

export function getID(): A2AID {
  if (!_id)
    _id = new A2AID({
      productId: 'a2a-id',
      registrationFee: '0',
      verificationFee: '0',
      annualReviewFee: '0',
    })
  return _id
}

export function getRevenue(): RevenueEngine {
  if (!_revenue) _revenue = new RevenueEngine({ mode: 'fixed_tier' })
  return _revenue
}

// ---------------------------------------------------------------------------
// Agent helpers
// ---------------------------------------------------------------------------

export function ensureAgent(did: string): AgentState {
  const agents = state.agents
  let agent = agents.get(did)
  if (!agent) {
    const parsed = parseDID(did)
    agent = {
      did,
      address: parsed?.address || did,
      kyaVerified: false,
      credentials: [],
      createdAt: Date.now(),
    }
    agents.set(did, agent)
  }
  return agent
}

export { generateDID, parseDID }
