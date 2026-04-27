import { describe, it, expect, beforeEach } from 'vitest'
import { A2AEarn } from '../src/earn.js'

describe('A2AEarn', () => {
  let earn: A2AEarn

  beforeEach(() => {
    earn = new A2AEarn()
  })

  describe('Strategies', () => {
    it('should return default strategies', () => {
      const strats = earn.getStrategies()
      expect(strats.length).toBe(3)
      expect(strats.map(s => s.type).sort()).toEqual(['aggressive', 'balanced', 'conservative'])
    })

    it('should return a specific strategy', () => {
      const s = earn.getStrategy('conservative')
      expect(s).toBeDefined()
      expect(s!.apy).toBe(0.05)
      expect(s!.risk).toBe('low')
    })

    it('should return undefined for unknown strategy', () => {
      expect(earn.getStrategy('super_risky' as any)).toBeUndefined()
    })

    it('should allow custom strategies', () => {
      earn.addStrategy({ type: 'conservative', name: 'Ultra Safe', apy: 0.03, risk: 'low', minDeposit: '1000000' })
      const s = earn.getStrategy('conservative')
      expect(s!.apy).toBe(0.03)
    })
  })

  describe('Deposit', () => {
    it('should create a deposit position', () => {
      const pos = earn.deposit('did:agent1', '100000000', 'USDC', 'balanced')
      expect(pos.id).toMatch(/^pos_/)
      expect(pos.status).toBe('active')
      expect(pos.amount).toBe('100000000')
      expect(pos.strategy).toBe('balanced')
      expect(pos.apy).toBe(0.10)
    })

    it('should reject below-minimum deposit', () => {
      expect(() => earn.deposit('did:a', '1000', 'USDC', 'aggressive')).toThrow('below minimum')
    })

    it('should reject unknown strategy', () => {
      expect(() => earn.deposit('did:a', '100000000', 'USDC', 'ponzi' as any)).toThrow('Unknown strategy')
    })
  })

  describe('Yield Accrual', () => {
    it('should accrue yield on an active position', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'conservative') // 5% APY

      // Simulate ~1 day passing by backdating lastAccrualAt
      const p = earn.getPosition(pos.id)!
      ;(p as any).lastAccrualAt = Date.now() - 86400_000

      const earned = earn.accrue(pos.id)
      expect(BigInt(earned)).toBeGreaterThan(0n)
    })

    it('should deduct management fee from yield', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      const p = earn.getPosition(pos.id)!
      ;(p as any).lastAccrualAt = Date.now() - 86400_000 * 365 // 1 year

      const earned = earn.accrue(pos.id)
      // Gross: 5% of 100M = 5M. Net with 1% mgmt fee & benchmark diff
      expect(BigInt(earned)).toBeLessThan(BigInt('5000000'))
      // Should still be positive
      expect(BigInt(earned)).toBeGreaterThan(0n)
    })

    it('should apply excess profit share for strategies above benchmark', () => {
      // Custom config with clear fees
      const e2 = new A2AEarn({ managementFee: 0.01, excessShare: 0.20, benchmarkApy: 0.04 })
      const pos = e2.deposit('did:a', '100000000', 'USDC', 'conservative') // 5% APY, 1% above 4% benchmark
      const p = e2.getPosition(pos.id)!
      ;(p as any).lastAccrualAt = Date.now() - 86400_000 * 365

      e2.accrue(pos.id)
      const updated = e2.getPosition(pos.id)!
      // Net yield should be positive but less than raw 5%
      expect(BigInt(updated.accruedYield)).toBeGreaterThan(0n)
      expect(BigInt(updated.accruedYield)).toBeLessThan(BigInt('5000000'))
    })

    it('should return 0 for redeemed position', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      earn.redeem(pos.id)
      const earned = earn.accrue(pos.id)
      expect(earned).toBe('0')
    })

    it('should accrue all agent positions', () => {
      earn.deposit('did:a', '50000000', 'USDC', 'conservative')
      earn.deposit('did:a', '50000000', 'USDC', 'balanced')

      // Backdate all
      for (const pos of earn.getAgentPositions('did:a')) {
        ;(pos as any).lastAccrualAt = Date.now() - 86400_000 * 30
      }

      const total = earn.accrueAll('did:a')
      expect(BigInt(total)).toBeGreaterThan(0n)
    })
  })

  describe('Redemption', () => {
    it('should redeem an active position', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      const redeemed = earn.redeem(pos.id)
      expect(redeemed.status).toBe('redeemed')
      expect(redeemed.redeemedAt).toBeGreaterThan(0)
    })

    it('should reject double redemption', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      earn.redeem(pos.id)
      expect(() => earn.redeem(pos.id)).toThrow('not active')
    })

    it('should accrue yield on redemption', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'balanced')
      const p = earn.getPosition(pos.id)!
      ;(p as any).lastAccrualAt = Date.now() - 86400_000 * 30

      earn.redeem(pos.id)
      const redeemed = earn.getPosition(pos.id)!
      expect(BigInt(redeemed.accruedYield)).toBeGreaterThan(0n)
    })

    it('should return total redeemable amount', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'balanced')
      const p = earn.getPosition(pos.id)!
      ;(p as any).lastAccrualAt = Date.now() - 86400_000 * 30

      earn.accrue(pos.id)
      const total = earn.getRedeemableAmount(pos.id)
      expect(BigInt(total)).toBeGreaterThan(BigInt('100000000'))
    })
  })

  describe('Projections', () => {
    it('should project yield over N days', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'balanced')
      const projected = earn.projectYield(pos.id, 30)
      expect(BigInt(projected)).toBeGreaterThan(0n)
    })
  })

  describe('Queries', () => {
    it('should return agent positions', () => {
      earn.deposit('did:x', '100000000', 'USDC', 'conservative')
      earn.deposit('did:x', '50000000', 'USDC', 'balanced')
      earn.deposit('did:y', '200000000', 'USDC', 'aggressive')

      expect(earn.getAgentPositions('did:x').length).toBe(2)
      expect(earn.getAgentPositions('did:x', 'active').length).toBe(2)
      earn.redeem(earn.getAgentPositions('did:x')[0].id)
      expect(earn.getAgentPositions('did:x', 'active').length).toBe(1)
    })

    it('should return yield history', () => {
      const pos = earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      const p = earn.getPosition(pos.id)!
      ;(p as any).lastAccrualAt = Date.now() - 86400_000
      earn.accrue(pos.id)
      ;(earn.getPosition(pos.id) as any).lastAccrualAt = Date.now() - 86400_000
      earn.accrue(pos.id)

      const history = earn.getYieldHistory(pos.id)
      expect(history.length).toBe(2)
    })

    it('should return TVL across active positions', () => {
      earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      earn.deposit('did:b', '200000000', 'USDC', 'balanced')
      expect(BigInt(earn.getTVL())).toBe(300000000n)
    })

    it('should return agent portfolio value', () => {
      earn.deposit('did:a', '100000000', 'USDC', 'conservative')
      earn.deposit('did:a', '50000000', 'USDC', 'balanced')
      expect(BigInt(earn.getAgentPortfolioValue('did:a'))).toBe(150000000n)
    })

    it('should return null for unknown position', () => {
      expect(earn.getPosition('pos_fake')).toBeNull()
    })

    it('should return empty yield history for unknown position', () => {
      expect(earn.getYieldHistory('pos_fake')).toEqual([])
    })
  })
})
