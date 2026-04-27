/**
 * 8004 On-Chain Identity Protocol
 *
 * Agent 链上身份标准：
 *   - DID 格式规范
 *   - SBT 凭证标准
 *   - 信用评分协议
 */

import type { AgentDID, AgentMetadata, CreditScore } from '../types/agent.js'
import type { SBTCredential, QualificationType } from '../types/credential.js'

export function generateDID(address: string, chain: string): AgentDID {
  return `did:bai:${chain}:${address}`
}

export function parseDID(did: AgentDID): { chain: string; address: string } | null {
  const parts = did.split(':')
  if (parts.length < 4 || parts[0] !== 'did' || parts[1] !== 'bai') {
    return null
  }
  return {
    chain: parts[2],
    address: parts.slice(3).join(':'),
  }
}

export function validateDID(did: string): boolean {
  return parseDID(did) !== null
}

export function createAgentMetadata(
  name: string,
  description: string,
  category: string[],
): AgentMetadata {
  return {
    name,
    description,
    category: category as AgentMetadata['category'],
  }
}

export interface SBTCredentialPayload {
  type: QualificationType
  metadata: Record<string, unknown>
  expiresInDays: number
}

export function createCredentialPayload(
  type: QualificationType,
  metadata: Record<string, unknown>,
  expiresInDays = 365,
): SBTCredentialPayload {
  return { type, metadata, expiresInDays }
}

export function calculateCreditScore(factors: CreditScore['factors']): number {
  const weights = {
    transactionVolume: 0.25,
    completionRate: 0.35,
    disputeRate: 0.20,
    accountAge: 0.10,
    credentialCount: 0.10,
  }

  const volumeScore = Math.min(factors.transactionVolume / 1000, 100)
  const completionScore = factors.completionRate * 100
  const disputeScore = Math.max(0, 100 - factors.disputeRate * 100)
  const ageScore = Math.min(factors.accountAge / (30 * 24 * 60 * 60 * 1000), 100)
  const credentialScore = Math.min(factors.credentialCount * 20, 100)

  const rawScore =
    volumeScore * weights.transactionVolume +
    completionScore * weights.completionRate +
    disputeScore * weights.disputeRate +
    ageScore * weights.accountAge +
    credentialScore * weights.credentialCount

  return Math.round(Math.max(300, Math.min(950, rawScore + 350)))
}

export function getCreditLevel(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'none' {
  if (score >= 750) return 'excellent'
  if (score >= 650) return 'good'
  if (score >= 500) return 'fair'
  if (score >= 350) return 'poor'
  return 'none'
}
