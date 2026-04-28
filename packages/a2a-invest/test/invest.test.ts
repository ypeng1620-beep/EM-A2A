import { describe, it, expect, beforeEach } from 'vitest'
import { A2AInvest } from '../src/invest.js'

describe('A2AInvest', () => {
  let invest: A2AInvest

  beforeEach(() => {
    invest = new A2AInvest()
  })

  describe('Risk Assessment', () => {
    it('should classify conservative profile (score <= 8)', () => {
      const result = invest.assessRisk([0, 0, 0, 0, 0]) // all 1s = score 5
      expect(result.profile).toBe('conservative')
      expect(result.score).toBe(5)
    })

    it('should classify aggressive profile (score > 20)', () => {
      const result = invest.assessRisk([4, 4, 4, 4, 4]) // all 5s = score 25
      expect(result.profile).toBe('aggressive')
      expect(result.score).toBe(25)
    })

    it('should classify balanced profile', () => {
      const result = invest.assessRisk([2, 2, 2, 2, 2]) // all 3s = score 15
      expect(result.profile).toBe('balanced')
    })

    it('should reject invalid answer count', () => {
      expect(() => invest.assessRisk([0, 0, 0])).toThrow('Must answer all 5')
    })

    it('should reject out-of-range answer', () => {
      expect(() => invest.assessRisk([0, 0, 0, 0, 5])).toThrow('Invalid answer')
    })

    it('should provide questionnaire', () => {
      const q = A2AInvest.getQuestionnaire()
      expect(q.length).toBe(5)
      q.forEach((item) => {
        expect(item.options.length).toBe(5)
      })
    })
  })

  describe('Portfolio Management', () => {
    it('should create a portfolio with assets', () => {
      const port = invest.createPortfolio({
        agentId: 'did:agent1',
        name: 'My Portfolio',
        assets: [
          { token: 'USDC', allocation: 0.4, amount: '400000000', apy: 0.05 },
          { token: 'ETH', allocation: 0.6, amount: '600000000', apy: 0.2 },
        ],
      })

      expect(port.id).toMatch(/^port_/)
      expect(port.status).toBe('active')
      expect(port.totalValue).toBe('1000000000')
      expect(port.assets.length).toBe(2)
      // avg APY = 0.4*0.05 + 0.6*0.20 = 0.14 → balanced
      expect(port.riskProfile).toBe('balanced')
    })

    it('should reject empty assets', () => {
      expect(() =>
        invest.createPortfolio({
          agentId: 'did:a',
          name: 'Empty',
          assets: [],
        }),
      ).toThrow('at least one asset')
    })

    it('should reject allocations not summing to 1', () => {
      expect(() =>
        invest.createPortfolio({
          agentId: 'did:a',
          name: 'Bad Alloc',
          assets: [
            { token: 'USDC', allocation: 0.5, amount: '200000000', apy: 0.05 },
            { token: 'ETH', allocation: 0.3, amount: '200000000', apy: 0.2 },
          ],
        }),
      ).toThrow('sum to 1')
    })

    it('should rebalance portfolio', () => {
      const port = invest.createPortfolio({
        agentId: 'did:agent1',
        name: 'Test',
        assets: [
          { token: 'USDC', allocation: 0.5, amount: '500000000', apy: 0.05 },
          { token: 'ETH', allocation: 0.5, amount: '500000000', apy: 0.2 },
        ],
      })

      const rebalanced = invest.rebalancePortfolio(port.id, [
        { token: 'USDC', allocation: 0.3 },
        { token: 'ETH', allocation: 0.7 },
      ])
      expect(rebalanced.assets.length).toBe(2)
      expect(rebalanced.assets[0].allocation).toBe(0.3)
      expect(rebalanced.assets[1].allocation).toBe(0.7)
    })

    it('should close a portfolio', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'Close me',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })

      const closed = invest.closePortfolio(port.id)
      expect(closed.status).toBe('closed')
    })

    it('should reject rebalancing closed portfolio', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'Closed',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.closePortfolio(port.id)

      expect(() => invest.rebalancePortfolio(port.id, [{ token: 'USDC', allocation: 1 }])).toThrow(
        'Cannot rebalance',
      )
    })
  })

  describe('Return Accrual', () => {
    it('should accrue return on active portfolio', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'Growth',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })

      // Backdate by 1 day
      const p = invest.getPortfolio(port.id)!
      ;(p as any).updatedAt = Date.now() - 86400_000

      const earned = invest.accrueReturn(port.id)
      expect(BigInt(earned)).toBeGreaterThan(0n)
    })

    it('should deduct management fee from return', () => {
      const e2 = new A2AInvest({ managementFee: 0.01 })
      const port = e2.createPortfolio({
        agentId: 'did:a',
        name: 'Fee test',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })

      const p = e2.getPortfolio(port.id)!
      ;(p as any).updatedAt = Date.now() - 86400_000 * 365 // 1 year

      const earned = e2.accrueReturn(port.id)
      // Gross: 5% of 100M = 5M. Net with 1% mgmt fee < 5M
      expect(BigInt(earned)).toBeGreaterThan(0n)
      expect(BigInt(earned)).toBeLessThan(BigInt('5000000'))
    })

    it('should return 0 for closed portfolio', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'Closed',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.closePortfolio(port.id)
      expect(invest.accrueReturn(port.id)).toBe('0')
    })

    it('should project return over N days', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'Project',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })

      const projected = invest.projectReturn(port.id, 30)
      expect(BigInt(projected)).toBeGreaterThan(0n)
    })
  })

  describe('Recommendations', () => {
    it('should return strategies matching risk profile and min investment', () => {
      const recs = invest.getRecommendations('conservative', '50000000')
      expect(recs.length).toBeGreaterThan(0)
      expect(recs[0].strategy.riskProfile).toBe('conservative')
      expect(recs[0].confidence).toBeGreaterThan(0)
      expect(recs[0].reasoning.length).toBeGreaterThan(0)
    })

    it('should filter out strategies below minInvestment', () => {
      const recs = invest.getRecommendations('aggressive', '1000000')
      expect(recs.length).toBe(0) // aggressive min is 500M
    })

    it('should allow adding custom strategies', () => {
      invest.addStrategy({
        type: 'custom_safe',
        name: 'Custom Safe',
        description: 'Test strategy',
        riskProfile: 'conservative',
        expectedReturn: 0.03,
        volatility: 0.01,
        minInvestment: '5000000',
        assetAllocation: [{ token: 'USDC', allocation: 1 }],
      })

      const recs = invest.getRecommendations('conservative', '10000000')
      expect(recs.some((r) => r.strategy.type === 'custom_safe')).toBe(true)
    })
  })

  describe('Queries', () => {
    it('should return agent portfolios', () => {
      invest.createPortfolio({
        agentId: 'did:x',
        name: 'P1',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.createPortfolio({
        agentId: 'did:x',
        name: 'P2',
        assets: [{ token: 'ETH', allocation: 1, amount: '200000000', apy: 0.2 }],
      })
      invest.createPortfolio({
        agentId: 'did:y',
        name: 'P3',
        assets: [{ token: 'USDC', allocation: 1, amount: '300000000', apy: 0.05 }],
      })

      expect(invest.getAgentPortfolios('did:x').length).toBe(2)
      expect(invest.getAgentPortfolios('did:y').length).toBe(1)
      expect(invest.getAgentPortfolios('did:z').length).toBe(0)
    })

    it('should filter portfolios by status', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'ToClose',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.closePortfolio(port.id)

      expect(invest.getAgentPortfolios('did:a', 'active').length).toBe(0)
      expect(invest.getAgentPortfolios('did:a', 'closed').length).toBe(1)
    })

    it('should return null for unknown portfolio', () => {
      expect(invest.getPortfolio('port_fake')).toBeNull()
    })

    it('should calculate total AUM', () => {
      invest.createPortfolio({
        agentId: 'did:a',
        name: 'P1',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.createPortfolio({
        agentId: 'did:b',
        name: 'P2',
        assets: [{ token: 'ETH', allocation: 1, amount: '200000000', apy: 0.2 }],
      })

      expect(BigInt(invest.getTotalAUM())).toBe(300000000n)
    })

    it('should calculate agent AUM', () => {
      invest.createPortfolio({
        agentId: 'did:a',
        name: 'P1',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.createPortfolio({
        agentId: 'did:a',
        name: 'P2',
        assets: [{ token: 'ETH', allocation: 1, amount: '200000000', apy: 0.2 }],
      })

      expect(BigInt(invest.getAgentAUM('did:a'))).toBe(300000000n)
      expect(invest.getAgentAUM('did:unknown')).toBe('0')
    })

    it('should close and exclude from AUM', () => {
      const port = invest.createPortfolio({
        agentId: 'did:a',
        name: 'P1',
        assets: [{ token: 'USDC', allocation: 1, amount: '100000000', apy: 0.05 }],
      })
      invest.closePortfolio(port.id)
      expect(invest.getTotalAUM()).toBe('0')
    })
  })
})
