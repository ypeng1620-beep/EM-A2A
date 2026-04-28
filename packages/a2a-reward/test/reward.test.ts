import { describe, it, expect, beforeEach } from 'vitest'
import { A2AReward } from '../src/reward.js'

describe('A2AReward', () => {
  let reward: A2AReward

  beforeEach(() => {
    reward = new A2AReward()
  })

  describe('Points Earning', () => {
    it('should earn points from a transaction', () => {
      const tx = reward.earnPoints('did:agent1', '500', 'transaction', '完成交易 #123')
      expect(tx.id).toMatch(/^pt_/)
      expect(tx.type).toBe('earn')
      expect(tx.amount).toBe('500')
    })

    it('should update balance after earning', () => {
      reward.earnPoints('did:agent1', '1000', 'transaction', 'Trade')
      const balance = reward.getBalance('did:agent1')
      expect(balance.total).toBe('1000')
      expect(balance.available).toBe('1000')
    })

    it('should award transaction points with bonus from amount', () => {
      const tx = reward.awardTransactionPoints('did:agent1', '100000000')
      // Base 100 + 0.1% of 100M = 100 + 100000 = 100100
      expect(BigInt(tx.amount)).toBeGreaterThan(BigInt('100'))
    })

    it('should award referral points', () => {
      const tx = reward.awardReferralPoints('did:agent1', 'did:newbie')
      expect(tx.amount).toBe('500')
      expect(tx.source).toBe('referral')
    })

    it('should award milestone points', () => {
      const tx = reward.awardMilestonePoints('did:agent1', '100th transaction')
      expect(tx.amount).toBe('1000')
      expect(tx.source).toBe('milestone')
    })

    it('should reject zero or negative amount', () => {
      expect(() => reward.earnPoints('did:a', '0', 'transaction', 'Zero')).toThrow(
        'must be positive',
      )
      expect(() => reward.earnPoints('did:a', '-100', 'transaction', 'Neg')).toThrow(
        'must be positive',
      )
    })

    it('should accumulate multiple earnings', () => {
      reward.earnPoints('did:agent1', '300', 'transaction', 'T1')
      reward.earnPoints('did:agent1', '200', 'bonus', 'B1')
      const balance = reward.getBalance('did:agent1')
      expect(balance.total).toBe('500')
      expect(balance.available).toBe('500')
    })

    it('should set expiry date on earned points', () => {
      const tx = reward.earnPoints('did:agent1', '100', 'transaction', 'Test')
      expect(tx.expiresAt).toBeGreaterThan(tx.createdAt)
    })
  })

  describe('Level System', () => {
    it('should start at bronze level', () => {
      const balance = reward.getBalance('did:agent1')
      expect(balance.level).toBe(0)
      expect(balance.levelName).toBe('铜牌')
    })

    it('should upgrade to silver at 1000 points', () => {
      reward.earnPoints('did:agent1', '1000', 'transaction', 'Big trade')
      const balance = reward.getBalance('did:agent1')
      expect(balance.level).toBe(1)
      expect(balance.levelName).toBe('银牌')
    })

    it('should upgrade to diamond at 1000000 points', () => {
      reward.earnPoints('did:agent1', '1000000', 'transaction', 'Whale trade')
      const balance = reward.getBalance('did:agent1')
      expect(balance.level).toBe(4)
      expect(balance.levelName).toBe('钻石')
    })
  })

  describe('Points Redemption', () => {
    it('should redeem points with option', () => {
      reward.earnPoints('did:agent1', '5000', 'transaction', 'Earn')
      const option = reward.createRedemptionOption({
        name: '手续费折扣',
        description: '50% off trading fee',
        pointsCost: '1000',
        benefit: 'Next 10 trades at 50% fee',
      })

      const tx = reward.redeemPoints('did:agent1', option.id)
      expect(tx.type).toBe('redeem')
      expect(tx.amount).toBe('1000')

      const balance = reward.getBalance('did:agent1')
      expect(balance.available).toBe('4000') // 5000 - 1000
      expect(balance.total).toBe('5000') // total stays
    })

    it('should reject redemption with insufficient points', () => {
      const option = reward.createRedemptionOption({
        name: 'VIP Access',
        description: 'VIP membership',
        pointsCost: '10000',
        benefit: 'VIP status for 30 days',
      })

      reward.earnPoints('did:agent1', '100', 'transaction', 'Little')
      expect(() => reward.redeemPoints('did:agent1', option.id)).toThrow('Insufficient')
    })

    it('should reject inactive option', () => {
      const option = reward.createRedemptionOption({
        name: 'Expired Deal',
        description: 'Old deal',
        pointsCost: '100',
        benefit: 'Nothing',
      })
      reward.earnPoints('did:agent1', '500', 'transaction', 'Earn')
      reward.deactivateOption(option.id)

      expect(() => reward.redeemPoints('did:agent1', option.id)).toThrow('not active')
    })
  })

  describe('Achievements', () => {
    it('should check and unlock achievements', () => {
      reward.earnPoints('did:agent1', '200000', 'transaction', 'Big earn')

      const unlocked = reward.checkAchievements('did:agent1')
      // Should unlock 'first_trade' (1 tx), 'whale' (100k points), 'millionaire' (1M points? No, only 200k)
      expect(unlocked.some((a) => a.id === 'first_trade')).toBe(true)
      expect(unlocked.some((a) => a.id === 'whale')).toBe(true)
      expect(unlocked.some((a) => a.id === 'millionaire')).toBe(false)
    })

    it('should not re-unlock already earned achievements', () => {
      reward.earnPoints('did:agent1', '10000', 'transaction', 'Earn')
      const first = reward.checkAchievements('did:agent1')
      expect(first.some((a) => a.id === 'first_trade')).toBe(true)

      const second = reward.checkAchievements('did:agent1')
      expect(second.some((a) => a.id === 'first_trade')).toBe(false)
    })

    it('should return earned achievements list', () => {
      reward.earnPoints('did:agent1', '50000', 'transaction', 'Trade')
      reward.checkAchievements('did:agent1')

      const earned = reward.getAgentAchievements('did:agent1')
      expect(earned.length).toBeGreaterThan(0)
      expect(earned.some((a) => a.id === 'first_trade')).toBe(true)
    })

    it('should return empty achievements for new agent', () => {
      expect(reward.getAgentAchievements('did:unknown').length).toBe(0)
    })

    it('should allow custom achievements', () => {
      reward.registerAchievement({
        id: 'custom_ach',
        name: 'Custom',
        description: 'Test',
        icon: '🏆',
        criteria: { type: 'total_points', threshold: 500 },
      })

      reward.earnPoints('did:agent1', '600', 'transaction', 'Test')
      const unlocked = reward.checkAchievements('did:agent1')
      expect(unlocked.some((a) => a.id === 'custom_ach')).toBe(true)
    })
  })

  describe('Redemption Options', () => {
    it('should create and list redemption options', () => {
      reward.createRedemptionOption({
        name: 'O1',
        description: 'D1',
        pointsCost: '100',
        benefit: 'B1',
      })
      reward.createRedemptionOption({
        name: 'O2',
        description: 'D2',
        pointsCost: '500',
        benefit: 'B2',
      })

      const options = reward.getRedemptionOptions()
      expect(options.length).toBe(2)
    })

    it('should filter inactive options', () => {
      const opt = reward.createRedemptionOption({
        name: 'O1',
        description: 'D1',
        pointsCost: '100',
        benefit: 'B1',
      })
      reward.deactivateOption(opt.id)

      expect(reward.getRedemptionOptions(true).length).toBe(0)
      expect(reward.getRedemptionOptions(false).length).toBe(1)
    })
  })

  describe('Leaderboard', () => {
    it('should return ranked leaderboard', () => {
      reward.earnPoints('did:a', '10000', 'transaction', 'T')
      reward.earnPoints('did:b', '5000', 'transaction', 'T')
      reward.earnPoints('did:c', '20000', 'transaction', 'T')

      const board = reward.getLeaderboard(10)
      expect(board.length).toBe(3)
      expect(board[0].agentId).toBe('did:c') // 20000
      expect(board[0].rank).toBe(1)
      expect(board[1].agentId).toBe('did:a') // 10000
      expect(board[2].agentId).toBe('did:b') // 5000
    })

    it('should respect limit', () => {
      reward.earnPoints('did:a', '1000', 'transaction', 'T')
      reward.earnPoints('did:b', '2000', 'transaction', 'T')
      reward.earnPoints('did:c', '3000', 'transaction', 'T')

      expect(reward.getLeaderboard(2).length).toBe(2)
    })
  })

  describe('Check-in & Streaks', () => {
    it('should start a streak on first check-in', () => {
      const result = reward.checkIn('did:agent1')
      expect(result.streakDays).toBe(1)
    })

    it('should award streak bonus', () => {
      // Set up balance and stats manually to simulate 6-day streak
      ;(reward as any).balances.set('did:agent1', {
        agentId: 'did:agent1',
        total: '10000',
        available: '10000',
        pending: '0',
        level: 1,
        levelName: '银牌',
      })
      ;(reward as any).agentStats.set('did:agent1', {
        transactions: 10,
        referrals: 2,
        streakDays: 6,
        lastActive: Date.now() - 86400_000,
      })

      const result = reward.checkIn('did:agent1')
      expect(result.streakDays).toBe(7)
      expect(BigInt(result.bonus)).toBeGreaterThan(0n)
    })
  })

  describe('Expiry', () => {
    it('should expire old earned points', () => {
      reward.earnPoints('did:agent1', '5000', 'transaction', 'Old')
      // Backdate the transaction
      const txs = (reward as any).transactions.get('did:agent1')
      txs[0].expiresAt = Date.now() - 1000

      const expired = reward.processExpiry()
      expect(expired).toBeGreaterThan(0)

      const balance = reward.getBalance('did:agent1')
      expect(balance.available).toBe('0')
    })
  })

  describe('Queries', () => {
    it('should return transaction history sorted by newest', () => {
      reward.earnPoints('did:agent1', '100', 'transaction', 'First')
      reward.earnPoints('did:agent1', '200', 'bonus', 'Second')

      const history = reward.getTransactions('did:agent1')
      expect(history.length).toBe(2)
      expect(history[0].createdAt).toBeGreaterThanOrEqual(history[1].createdAt)
    })

    it('should respect limit on transaction history', () => {
      reward.earnPoints('did:agent1', '100', 'transaction', 'T1')
      reward.earnPoints('did:agent1', '200', 'transaction', 'T2')

      expect(reward.getTransactions('did:agent1', 1).length).toBe(1)
    })

    it('should return empty transactions for unknown agent', () => {
      expect(reward.getTransactions('did:unknown')).toEqual([])
    })

    it('should calculate total points issued', () => {
      reward.earnPoints('did:a', '1000', 'transaction', 'T')
      reward.earnPoints('did:b', '3000', 'transaction', 'T')
      expect(reward.getTotalPointsIssued()).toBe('4000')
    })

    it('should count active agents', () => {
      reward.earnPoints('did:a', '100', 'transaction', 'T')
      reward.earnPoints('did:b', '200', 'transaction', 'T')
      expect(reward.getActiveAgentCount()).toBe(2)
    })

    it('should return all achievements', () => {
      const all = reward.getAllAchievements()
      expect(all.length).toBeGreaterThanOrEqual(6)
    })
  })
})
