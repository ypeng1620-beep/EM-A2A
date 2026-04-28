/**
 * A2A Insure — Agent Behavior Insurance & Service Fulfillment Bond
 *
 * Two products:
 *   fulfillment — covers buyer if seller fails to deliver (premium 15–25%)
 *   payment     — covers seller if buyer defaults on payment (premium 10–20%)
 *
 * Premium rate is credit-adjusted: higher credit → lower premium.
 * Claims require evidence and are subject to deductible.
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsuranceType = 'fulfillment' | 'payment'
export type PolicyStatus = 'active' | 'expired' | 'claimed' | 'settled' | 'rejected'
export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export interface Policy {
  id: string
  type: InsuranceType
  holderId: string
  counterpartyId: string
  coverageAmount: string
  premium: string
  premiumRate: number
  deductible: string
  currency: string
  status: PolicyStatus
  issuedAt: number
  expiresAt: number
  orderId?: string
  creditScore: number
}

export interface Claim {
  id: string
  policyId: string
  claimantId: string
  amount: string
  reason: string
  evidence: string[]
  status: ClaimStatus
  filedAt: number
  resolvedAt: number | null
  payout: string | null
  txHash?: string
}

export interface A2AInsureConfig {
  fulfillmentBaseRate?: number // 0.15–0.25
  paymentBaseRate?: number // 0.10–0.20
  deductibleRatio?: number // portion of coverageAmount
}

// ---------------------------------------------------------------------------
// BigInt helpers
// ---------------------------------------------------------------------------

function bigAdd(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString()
}

function bigSub(a: string, b: string): string {
  const r = BigInt(a) - BigInt(b)
  return r < 0n ? '0' : r.toString()
}

function bigMulRatio(amount: string, ratio: number): string {
  return ((BigInt(amount) * BigInt(Math.round(ratio * 1_000_000))) / 1_000_000n).toString()
}

// ---------------------------------------------------------------------------
// Premium calculation
// ---------------------------------------------------------------------------

const BASE_RATES: Record<InsuranceType, { min: number; max: number }> = {
  fulfillment: { min: 0.15, max: 0.25 },
  payment: { min: 0.1, max: 0.2 },
}

/** Premium rate = base rate adjusted by credit score. */
function calcPremiumRate(type: InsuranceType, creditScore: number, configBase?: number): number {
  const range = BASE_RATES[type]
  // Score 950 → pay min rate; score 300 → pay max rate
  const factor = (950 - creditScore) / (950 - 300)
  const minRate = configBase ?? range.min
  return minRate + factor * (range.max - minRate)
}

// ---------------------------------------------------------------------------
// A2A Insure
// ---------------------------------------------------------------------------

export class A2AInsure {
  private policies: Map<string, Policy>
  private claims: Map<string, Claim[]>
  private fulfillmentBaseRate: number
  private paymentBaseRate: number
  private deductibleRatio: number

  constructor(config: A2AInsureConfig = {}) {
    this.policies = new Map()
    this.claims = new Map()
    this.fulfillmentBaseRate = config.fulfillmentBaseRate ?? 0.15
    this.paymentBaseRate = config.paymentBaseRate ?? 0.1
    this.deductibleRatio = config.deductibleRatio ?? 0.05 // 5% deductible
  }

  // =========================================================================
  // Policy Issuance
  // =========================================================================

  issuePolicy(params: {
    type: InsuranceType
    holderId: string
    counterpartyId: string
    coverageAmount: string
    currency: string
    termDays: number
    creditScore: number
    orderId?: string
  }): Policy {
    if (params.termDays <= 0 || params.termDays > 365) {
      throw new Error('Term must be 1–365 days')
    }

    const baseRate = params.type === 'fulfillment' ? this.fulfillmentBaseRate : this.paymentBaseRate

    const premiumRate = calcPremiumRate(params.type, params.creditScore, baseRate)
    const premium = bigMulRatio(params.coverageAmount, premiumRate)
    const deductible = bigMulRatio(params.coverageAmount, this.deductibleRatio)

    const policy: Policy = {
      id: `policy_${randomUUID().slice(0, 8)}`,
      type: params.type,
      holderId: params.holderId,
      counterpartyId: params.counterpartyId,
      coverageAmount: params.coverageAmount,
      premium,
      premiumRate,
      deductible,
      currency: params.currency,
      status: 'active',
      issuedAt: Date.now(),
      expiresAt: Date.now() + params.termDays * 86400_000,
      orderId: params.orderId,
      creditScore: params.creditScore,
    }

    this.policies.set(policy.id, policy)
    return policy
  }

  // =========================================================================
  // Claims
  // =========================================================================

  fileClaim(params: {
    policyId: string
    claimantId: string
    amount: string
    reason: string
    evidence?: string[]
  }): Claim {
    const policy = this.mustGetPolicy(params.policyId)
    if (policy.status !== 'active' && policy.status !== 'claimed') {
      throw new Error(`Policy is not active: ${policy.status}`)
    }
    if (Date.now() > policy.expiresAt) {
      throw new Error('Policy has expired')
    }

    const claimAmount = BigInt(params.amount)
    if (claimAmount <= 0n) {
      throw new Error('Claim amount must be positive')
    }
    if (claimAmount > BigInt(policy.coverageAmount)) {
      throw new Error('Claim exceeds coverage amount')
    }

    const claim: Claim = {
      id: `claim_${randomUUID().slice(0, 8)}`,
      policyId: params.policyId,
      claimantId: params.claimantId,
      amount: params.amount,
      reason: params.reason,
      evidence: params.evidence ?? [],
      status: 'pending',
      filedAt: Date.now(),
      resolvedAt: null,
      payout: null,
    }

    policy.status = 'claimed'

    const claims = this.claims.get(params.policyId) ?? []
    claims.push(claim)
    this.claims.set(params.policyId, claims)

    return claim
  }

  // =========================================================================
  // Claim Resolution
  // =========================================================================

  approveClaim(claimId: string, policyId: string, txHash?: string): Claim {
    const claim = this.mustGetClaim(claimId, policyId)
    if (claim.status !== 'pending') throw new Error(`Claim is not pending: ${claim.status}`)

    const policy = this.mustGetPolicy(policyId)
    const deductible = policy.deductible
    const payout = bigSub(claim.amount, deductible)

    claim.status = 'approved'
    claim.payout = payout
    claim.resolvedAt = Date.now()
    if (txHash) claim.txHash = txHash

    return claim
  }

  rejectClaim(claimId: string, policyId: string, reason?: string): Claim {
    const claim = this.mustGetClaim(claimId, policyId)
    if (claim.status !== 'pending') throw new Error(`Claim is not pending: ${claim.status}`)

    claim.status = 'rejected'
    claim.resolvedAt = Date.now()
    claim.payout = '0'

    const policy = this.mustGetPolicy(policyId)
    policy.status = 'rejected'

    return claim
  }

  settleClaim(claimId: string, policyId: string, txHash?: string): Claim {
    const claim = this.mustGetClaim(claimId, policyId)
    if (claim.status !== 'approved') throw new Error(`Claim not approved: ${claim.status}`)

    claim.status = 'paid'
    if (txHash) claim.txHash = txHash

    const policy = this.mustGetPolicy(policyId)
    policy.status = 'settled'

    return claim
  }

  // =========================================================================
  // Expiry
  // =========================================================================

  processExpired(): string[] {
    const now = Date.now()
    const expired: string[] = []
    for (const policy of this.policies.values()) {
      if (policy.status === 'active' && now > policy.expiresAt) {
        policy.status = 'expired'
        expired.push(policy.id)
      }
    }
    return expired
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getPolicy(policyId: string): Policy | null {
    return this.policies.get(policyId) ?? null
  }

  getAgentPolicies(agentId: string, status?: PolicyStatus): Policy[] {
    const all = [...this.policies.values()].filter(
      (p) => p.holderId === agentId || p.counterpartyId === agentId,
    )
    return status ? all.filter((p) => p.status === status) : all
  }

  getClaims(policyId: string): Claim[] {
    return this.claims.get(policyId) ?? []
  }

  getClaim(claimId: string, policyId: string): Claim | null {
    const claims = this.claims.get(policyId) ?? []
    return claims.find((c) => c.id === claimId) ?? null
  }

  /** Estimate premium without issuing a policy. */
  static estimatePremium(
    type: InsuranceType,
    coverageAmount: string,
    creditScore: number,
  ): { rate: number; premium: string } {
    const rate = calcPremiumRate(type, creditScore)
    const premium = bigMulRatio(coverageAmount, rate)
    return { rate, premium }
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private mustGetPolicy(policyId: string): Policy {
    const p = this.policies.get(policyId)
    if (!p) throw new Error(`Policy not found: ${policyId}`)
    return p
  }

  private mustGetClaim(claimId: string, policyId: string): Claim {
    const claims = this.claims.get(policyId) ?? []
    const claim = claims.find((c) => c.id === claimId)
    if (!claim) throw new Error(`Claim not found: ${claimId}`)
    return claim
  }
}

export default A2AInsure
