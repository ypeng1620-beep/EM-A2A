/**
 * Agent 身份类型 — 8004 链上身份
 */

import type { SBTCredential } from './credential.js'

export type AgentDID = string

export type AgentStatus = 'active' | 'inactive' | 'suspended' | 'banned'

export interface AgentIdentity {
  did: AgentDID
  address: string
  chain: string
  registeredAt: number
  status: AgentStatus
  metadata: AgentMetadata
  credentials: SBTCredential[]
}

export interface AgentMetadata {
  name: string
  description?: string
  category: AgentCategory[]
  serviceEndpoint?: string
  avatar?: string
  website?: string
}

export type AgentCategory =
  | 'coding'
  | 'design'
  | 'writing'
  | 'analysis'
  | 'customer_service'
  | 'trading'
  | 'compliance'
  | 'education'
  | 'research'
  | 'other'

export interface CreditScore {
  did: AgentDID
  score: number // 300-950
  level: CreditLevel
  updatedAt: number
  factors: CreditFactors
  history: CreditRecord[]
}

export type CreditLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'none'

export interface CreditFactors {
  transactionVolume: number
  completionRate: number
  disputeRate: number
  accountAge: number
  credentialCount: number
}

export interface CreditRecord {
  timestamp: number
  score: number
  event: string
  delta: number
}
