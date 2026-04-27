/**
 * KYA Engine — Know Your Agent
 * Agent 身份验证、风险评级、验证状态管理
 */

import type { AgentDID, AgentIdentity, SBTCredential } from '@em/a2a-core'
import type { ComplianceResult, RiskLevel } from './types.js'

export type KYAStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired'

export interface KYARecord {
  did: AgentDID
  status: KYAStatus
  riskScore: number
  riskLevel: RiskLevel
  verifiedAt?: number
  expiresAt?: number
  credentials: string[]
  flags: string[]
}

export class KYAEngine {
  private records = new Map<AgentDID, KYARecord>()

  submitForVerification(identity: AgentIdentity): KYARecord {
    const record: KYARecord = {
      did: identity.did,
      status: 'pending',
      riskScore: 50,
      riskLevel: 'medium',
      credentials: identity.credentials.map(c => c.id),
      flags: [],
    }
    this.records.set(identity.did, record)
    return record
  }

  verify(did: AgentDID, approved: boolean, metadata: Record<string, unknown> = {}): KYARecord {
    const record = this.records.get(did)
    if (!record) throw new Error(`Agent ${did} not found`)

    record.status = approved ? 'verified' : 'rejected'
    record.verifiedAt = approved ? Date.now() : undefined
    record.expiresAt = approved ? Date.now() + 365 * 24 * 60 * 60 * 1000 : undefined

    this.records.set(did, record)
    return record
  }

  assessRisk(identity: AgentIdentity): ComplianceResult {
    const record = this.records.get(identity.did)
    const reasons: string[] = []

    let score = 50

    if (!record || record.status === 'unverified') {
      score += 30
      reasons.push('Agent not verified')
    } else if (record.status === 'rejected') {
      score += 50
      reasons.push('Agent verification rejected')
    }

    const credentialCount = identity.credentials.length
    if (credentialCount === 0) {
      score += 15
      reasons.push('No credentials found')
    } else if (credentialCount >= 3) {
      score -= 10
    }

    const ageDays = (Date.now() - identity.registeredAt) / (24 * 60 * 60 * 1000)
    if (ageDays < 7) {
      score += 20
      reasons.push('Agent is new (< 7 days)')
    } else if (ageDays > 365) {
      score -= 15
    }

    score = Math.max(0, Math.min(100, score))

    let riskLevel: RiskLevel = 'low'
    let decision: ComplianceResult['decision'] = 'approved'

    if (score >= 70) {
      riskLevel = 'critical'
      decision = 'blocked'
    } else if (score >= 50) {
      riskLevel = 'high'
      decision = 'manual_review'
    } else if (score >= 30) {
      riskLevel = 'medium'
      decision = 'flagged'
    }

    return {
      decision,
      riskLevel,
      riskScore: score,
      reasons,
      timestamp: Date.now(),
      auditRef: `kya_${identity.did}_${Date.now()}`,
      flags: [],
    }
  }

  getRecord(did: AgentDID): KYARecord | undefined {
    return this.records.get(did)
  }

  isVerified(did: AgentDID): boolean {
    const record = this.records.get(did)
    if (!record) return false
    if (record.status !== 'verified') return false
    if (record.expiresAt && Date.now() > record.expiresAt) {
      record.status = 'expired'
      return false
    }
    return true
  }
}
