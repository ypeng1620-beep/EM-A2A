import { describe, it, expect, beforeEach } from 'vitest'
import { A2AInsure } from '../src/insure.js'

describe('A2AInsure', () => {
  let insure: A2AInsure

  beforeEach(() => {
    insure = new A2AInsure()
  })

  describe('Policy Issuance', () => {
    it('should issue a fulfillment policy', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000', // 500 USDC
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
        orderId: 'order_abc',
      })
      expect(policy.id).toMatch(/^policy_/)
      expect(policy.status).toBe('active')
      expect(policy.premiumRate).toBeGreaterThan(0.15)
      expect(policy.premiumRate).toBeLessThan(0.22)
      expect(BigInt(policy.premium)).toBeGreaterThan(0n)
      expect(BigInt(policy.deductible)).toBeGreaterThan(0n)
    })

    it('should issue a payment policy', () => {
      const policy = insure.issuePolicy({
        type: 'payment',
        holderId: 'did:seller',
        counterpartyId: 'did:buyer',
        coverageAmount: '200000000',
        currency: 'USDC',
        termDays: 14,
        creditScore: 600,
      })
      expect(policy.type).toBe('payment')
      expect(policy.premiumRate).toBeGreaterThanOrEqual(0.1)
      expect(policy.premiumRate).toBeLessThan(0.2)
    })

    it('should lower premium for high credit score', () => {
      const low = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:lq',
        counterpartyId: 'did:a',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 350,
      })
      const high = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:hq',
        counterpartyId: 'did:b',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 900,
      })
      expect(high.premiumRate).toBeLessThan(low.premiumRate)
      expect(BigInt(high.premium)).toBeLessThan(BigInt(low.premium))
    })

    it('should reject invalid term', () => {
      expect(() =>
        insure.issuePolicy({
          type: 'fulfillment',
          holderId: 'did:a',
          counterpartyId: 'did:b',
          coverageAmount: '100000000',
          currency: 'USDC',
          termDays: 0,
          creditScore: 700,
        }),
      ).toThrow('1–365 days')

      expect(() =>
        insure.issuePolicy({
          type: 'fulfillment',
          holderId: 'did:a',
          counterpartyId: 'did:b',
          coverageAmount: '100000000',
          currency: 'USDC',
          termDays: 400,
          creditScore: 700,
        }),
      ).toThrow('1–365 days')
    })
  })

  describe('Claims', () => {
    it('should file a claim against an active policy', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      const claim = insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:buyer',
        amount: '300000000',
        reason: 'Seller did not deliver audit report',
        evidence: ['tx_failed_0xabc'],
      })
      expect(claim.id).toMatch(/^claim_/)
      expect(claim.status).toBe('pending')
      expect(insure.getPolicy(policy.id)!.status).toBe('claimed')
    })

    it('should reject claim on expired policy', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 1,
        creditScore: 700,
      })
      // Manually expire
      const p = insure.getPolicy(policy.id)!
      ;(p as any).expiresAt = Date.now() - 1000
      insure.processExpired()

      expect(() =>
        insure.fileClaim({
          policyId: policy.id,
          claimantId: 'did:buyer',
          amount: '100000000',
          reason: 'Late',
        }),
      ).toThrow('not active')
    })

    it('should reject claim exceeding coverage', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      expect(() =>
        insure.fileClaim({
          policyId: policy.id,
          claimantId: 'did:buyer',
          amount: '200000000',
          reason: 'Over limit',
        }),
      ).toThrow('exceeds coverage')
    })

    it('should reject zero amount claim', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      expect(() =>
        insure.fileClaim({
          policyId: policy.id,
          claimantId: 'did:buyer',
          amount: '0',
          reason: 'Free?',
        }),
      ).toThrow('must be positive')
    })
  })

  describe('Claim Resolution', () => {
    it('should approve a claim and compute payout', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      const claim = insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:buyer',
        amount: '200000000',
        reason: 'Breach',
      })

      const approved = insure.approveClaim(claim.id, policy.id, '0xpayout')
      expect(approved.status).toBe('approved')
      expect(approved.payout).not.toBeNull()
      // Payout = claim amount - deductible (5% of 500M = 25M)
      expect(BigInt(approved.payout!)).toBeLessThan(BigInt('200000000'))
      expect(approved.txHash).toBe('0xpayout')
    })

    it('should reject a claim', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      const claim = insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:buyer',
        amount: '100000000',
        reason: 'Test',
      })

      const rejected = insure.rejectClaim(claim.id, policy.id, 'Insufficient evidence')
      expect(rejected.status).toBe('rejected')
      expect(insure.getPolicy(policy.id)!.status).toBe('rejected')
    })

    it('should settle an approved claim', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      const claim = insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:buyer',
        amount: '100000000',
        reason: 'Lost goods',
      })
      insure.approveClaim(claim.id, policy.id)

      const settled = insure.settleClaim(claim.id, policy.id, '0xsettle')
      expect(settled.status).toBe('paid')
      expect(insure.getPolicy(policy.id)!.status).toBe('settled')
    })

    it('should reject settling non-approved claim', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:buyer',
        counterpartyId: 'did:seller',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      const claim = insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:buyer',
        amount: '100000000',
        reason: 'Test',
      })
      expect(() => insure.settleClaim(claim.id, policy.id)).toThrow('not approved')
    })
  })

  describe('Expiry', () => {
    it('should expire policies past their term', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:a',
        counterpartyId: 'did:b',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 1,
        creditScore: 700,
      })
      const p = insure.getPolicy(policy.id)!
      ;(p as any).expiresAt = Date.now() - 1000

      const expired = insure.processExpired()
      expect(expired).toContain(policy.id)
      expect(insure.getPolicy(policy.id)!.status).toBe('expired')
    })
  })

  describe('Queries', () => {
    it('should return agent policies', () => {
      insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:x',
        counterpartyId: 'did:y',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      insure.issuePolicy({
        type: 'payment',
        holderId: 'did:z',
        counterpartyId: 'did:x',
        coverageAmount: '200000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })

      expect(insure.getAgentPolicies('did:x').length).toBe(2)
      expect(insure.getAgentPolicies('did:unknown').length).toBe(0)
    })

    it('should filter policies by status', () => {
      const p = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:a',
        counterpartyId: 'did:b',
        coverageAmount: '100000000',
        currency: 'USDC',
        termDays: 1,
        creditScore: 700,
      })
      ;(insure.getPolicy(p.id) as any).expiresAt = Date.now() - 1000
      insure.processExpired()

      expect(insure.getAgentPolicies('did:a', 'active').length).toBe(0)
      expect(insure.getAgentPolicies('did:a', 'expired').length).toBe(1)
    })

    it('should return claims for a policy', () => {
      const policy = insure.issuePolicy({
        type: 'fulfillment',
        holderId: 'did:a',
        counterpartyId: 'did:b',
        coverageAmount: '500000000',
        currency: 'USDC',
        termDays: 30,
        creditScore: 700,
      })
      insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:a',
        amount: '100000000',
        reason: 'C1',
      })
      insure.fileClaim({
        policyId: policy.id,
        claimantId: 'did:a',
        amount: '50000000',
        reason: 'C2',
      })

      expect(insure.getClaims(policy.id).length).toBe(2)
      expect(insure.getClaims('policy_fake').length).toBe(0)
    })

    it('should return null for unknown policy', () => {
      expect(insure.getPolicy('policy_fake')).toBeNull()
    })

    it('should return null for unknown claim', () => {
      expect(insure.getClaim('claim_fake', 'policy_fake')).toBeNull()
    })
  })

  describe('Static Estimate', () => {
    it('should estimate premium without issuing policy', () => {
      const est = A2AInsure.estimatePremium('fulfillment', '100000000', 800)
      expect(est.rate).toBeGreaterThan(0.15)
      expect(est.rate).toBeLessThan(0.2)
      expect(BigInt(est.premium)).toBeGreaterThan(0n)
    })
  })
})
