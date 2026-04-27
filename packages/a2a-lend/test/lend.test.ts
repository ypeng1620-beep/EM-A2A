import { describe, it, expect, beforeEach } from 'vitest'
import { A2ALend } from '../src/lend.js'

describe('A2ALend', () => {
  let lend: A2ALend

  beforeEach(() => {
    lend = new A2ALend()
  })

  describe('Loan Application', () => {
    it('should create a loan application', () => {
      const loan = lend.apply({
        agentId: 'did:bai:tron:agent1',
        amount: '100000000', // 100 USDC
        currency: 'USDC',
        purpose: 'working capital',
        termDays: 30,
        creditScore: 700,
      })
      expect(loan.id).toMatch(/^loan_/)
      expect(loan.status).toBe('applied')
      expect(loan.amount).toBe('100000000')
      expect(loan.interestRate).toBe(0.12) // 600-749 tier
    })

    it('should assign 8% rate to high-credit agent (750+)', () => {
      const loan = lend.apply({
        agentId: 'did:hq', amount: '100000000', currency: 'USDC',
        purpose: 'expansion', termDays: 30, creditScore: 800,
      })
      expect(loan.interestRate).toBe(0.08)
    })

    it('should assign 20% rate to low-credit agent (< 450)', () => {
      const loan = lend.apply({
        agentId: 'did:lq', amount: '100000000', currency: 'USDC',
        purpose: 'rescue', termDays: 30, creditScore: 350,
      })
      expect(loan.interestRate).toBe(0.20)
    })

    it('should reject amount below minimum', () => {
      expect(() => lend.apply({
        agentId: 'did:a', amount: '1000', currency: 'USDC',
        purpose: 'tiny', termDays: 7, creditScore: 700,
      })).toThrow('below minimum')
    })

    it('should reject amount above maximum', () => {
      expect(() => lend.apply({
        agentId: 'did:a', amount: '999999999999', currency: 'USDC',
        purpose: 'huge', termDays: 7, creditScore: 700,
      })).toThrow('exceeds maximum')
    })

    it('should reject term over 365 days', () => {
      expect(() => lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'long', termDays: 400, creditScore: 700,
      })).toThrow('1–365 days')
    })

    it('should compute totalOwed = principal + interest', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'test', termDays: 30, creditScore: 700,
      })
      // 12% APR for 30/365 → ~0.9863%
      const principal = BigInt(loan.amount)
      const owed = BigInt(loan.totalOwed)
      expect(owed).toBeGreaterThan(principal)
    })
  })

  describe('Loan Lifecycle', () => {
    it('should fund an applied loan', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 30, creditScore: 700,
      })
      const funded = lend.fund(loan.id)
      expect(funded.status).toBe('active')
      expect(funded.fundedAt).toBeGreaterThan(0)
    })

    it('should reject funding non-applied loan', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      // Already funded, can't fund again
      expect(() => lend.fund(loan.id)).toThrow('Cannot fund')
    })

    it('should accept full repayment', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      const rep = lend.repay(loan.id, loan.totalOwed)
      expect(rep.id).toMatch(/^repay_/)
      const updated = lend.getLoan(loan.id)
      expect(updated!.status).toBe('repaid')
    })

    it('should accept partial repayment', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      lend.repay(loan.id, '50000000')
      const updated = lend.getLoan(loan.id)
      expect(updated!.status).toBe('active')
      expect(updated!.amountRepaid).toBe('50000000')
    })

    it('should reject overpayment beyond owed', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      lend.repay(loan.id, loan.totalOwed)
      // Already fully repaid
      expect(() => lend.repay(loan.id, '1000000')).toThrow('already repaid')
    })
  })

  describe('Default & Liquidation', () => {
    it('should process overdue loans as defaulted', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 1, creditScore: 700,
      })
      lend.fund(loan.id)

      // Manually push dueAt into the past
      const l = lend.getLoan(loan.id)!
      ;(l as any).dueAt = Date.now() - 1000

      const defaulted = lend.processDefaults()
      expect(defaulted).toContain(loan.id)
      expect(lend.getLoan(loan.id)!.status).toBe('defaulted')
    })

    it('should liquidate a defaulted loan', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 1, creditScore: 700,
      })
      lend.fund(loan.id)
      const l = lend.getLoan(loan.id)!
      ;(l as any).dueAt = Date.now() - 1000
      lend.processDefaults()

      const liq = lend.liquidate(loan.id)
      expect(liq.status).toBe('liquidated')
    })

    it('should reject liquidation of non-defaulted loan', () => {
      const loan = lend.apply({
        agentId: 'did:a', amount: '100000000', currency: 'USDC',
        purpose: 'wc', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      expect(() => lend.liquidate(loan.id)).toThrow('Only defaulted')
    })
  })

  describe('Queries', () => {
    it('should return agent loans filtered by status', () => {
      const loan = lend.apply({
        agentId: 'did:q', amount: '100000000', currency: 'USDC',
        purpose: 'a', termDays: 30, creditScore: 700,
      })
      expect(lend.getAgentLoans('did:q', 'applied').length).toBe(1)
      expect(lend.getAgentLoans('did:q', 'active').length).toBe(0)
    })

    it('should return repayments for a loan', () => {
      const loan = lend.apply({
        agentId: 'did:r', amount: '100000000', currency: 'USDC',
        purpose: 'r', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      lend.repay(loan.id, '30000000')
      lend.repay(loan.id, '20000000')
      expect(lend.getRepayments(loan.id).length).toBe(2)
    })

    it('should compute remaining balance', () => {
      const loan = lend.apply({
        agentId: 'did:b', amount: '100000000', currency: 'USDC',
        purpose: 'b', termDays: 30, creditScore: 700,
      })
      lend.fund(loan.id)
      lend.repay(loan.id, '40000000')
      const rem = lend.getRemainingBalance(loan.id)
      expect(BigInt(rem)).toBeGreaterThan(0n)
    })

    it('should return active loans', () => {
      const l1 = lend.apply({
        agentId: 'did:c1', amount: '100000000', currency: 'USDC',
        purpose: 'x', termDays: 30, creditScore: 700,
      })
      lend.apply({
        agentId: 'did:c2', amount: '200000000', currency: 'USDC',
        purpose: 'y', termDays: 30, creditScore: 700,
      })
      lend.fund(l1.id)
      expect(lend.getActiveLoans().length).toBe(1)
    })

    it('should estimate rate statically', () => {
      expect(A2ALend.estimateRate(800)).toBe(0.08)
      expect(A2ALend.estimateRate(650)).toBe(0.12)
      expect(A2ALend.estimateRate(500)).toBe(0.16)
      expect(A2ALend.estimateRate(350)).toBe(0.20)
    })

    it('should return null for unknown loan', () => {
      expect(lend.getLoan('loan_nonexistent')).toBeNull()
    })

    it('should return empty repayments for unknown loan', () => {
      expect(lend.getRepayments('loan_fake')).toEqual([])
    })
  })
})
