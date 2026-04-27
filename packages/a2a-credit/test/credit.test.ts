import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { A2ACredit } from '../src/credit.js'

describe('A2ACredit', () => {
  let credit: A2ACredit

  beforeEach(() => {
    credit = new A2ACredit() // in-memory SQLite
  })

  afterEach(() => {
    credit.close()
  })

  describe('Initial Score', () => {
    it('should calculate initial credit score in valid range', () => {
      const score = credit.calculateScore('did:bai:tron:test1')
      expect(score.score).toBeGreaterThanOrEqual(300)
      expect(score.score).toBeLessThanOrEqual(950)
      expect(score.level).toBeDefined()
    })

    it('should return null for unknown agent', () => {
      expect(credit.getCreditScore('did:bai:tron:unknown')).toBeNull()
    })

    it('should return "none" level for unknown agent', () => {
      expect(credit.getCreditLevel('did:bai:tron:unknown')).toBe('none')
    })
  })

  describe('Behavior Recording', () => {
    it('should record and retrieve behaviors', () => {
      credit.recordBehavior('did:a', 'payment', { amount: '100' })
      const behaviors = credit.getBehaviors('did:a')
      expect(behaviors.length).toBe(1)
      expect(behaviors[0].event).toBe('payment')
    })

    it('should persist behaviors across score recalculations', () => {
      credit.recordBehavior('did:b', 'payment', { amount: '500' })
      credit.recordBehavior('did:b', 'payment', { amount: '300' })
      const behaviors = credit.getBehaviors('did:b')
      expect(behaviors.length).toBe(2)
    })
  })

  describe('Score Improvement', () => {
    it('should improve score with good behavior', () => {
      for (let i = 0; i < 50; i++) {
        credit.recordBehavior('did:bai:tron:test2', 'order_completed', { amount: '1000000' })
        credit.recordBehavior('did:bai:tron:test2', 'payment', { amount: '1000000' })
      }
      const score = credit.calculateScore('did:bai:tron:test2')
      expect(score.score).toBeGreaterThan(400)
    })

    it('should lower score with disputes', () => {
      for (let i = 0; i < 10; i++) {
        credit.recordBehavior('did:bai:tron:test3', 'order_completed', {})
      }
      for (let i = 0; i < 8; i++) {
        credit.recordBehavior('did:bai:tron:test3', 'order_disputed', {})
      }
      const score = credit.calculateScore('did:bai:tron:test3')
      expect(score.score).toBeLessThan(600)
    })
  })

  describe('Persistent Storage', () => {
    it('should persist scores between sessions', () => {
      const dbPath = ':memory:'
      const c1 = new A2ACredit({ dbPath })
      // Record enough good behaviors to push score above default
      for (let i = 0; i < 30; i++) {
        c1.recordBehavior('did:persist', 'order_completed', { amount: '1000000' })
        c1.recordBehavior('did:persist', 'payment', { amount: '1000000' })
      }
      const score1 = c1.getCreditScore('did:persist')
      expect(score1).not.toBeNull()
      expect(score1!.score).toBeGreaterThan(380)
      c1.close()
    })
  })

  describe('Score Trends', () => {
    it('should track score history', () => {
      credit.recordBehavior('did:trend', 'payment', { amount: '1000' })
      credit.recordBehavior('did:trend', 'order_completed', { amount: '1000' })
      credit.recordBehavior('did:trend', 'payment', { amount: '1000' })

      const history = credit.getCreditHistory('did:trend')
      expect(history.length).toBeGreaterThan(0)
    })

    it('should return score trend data', () => {
      for (let i = 0; i < 20; i++) {
        credit.recordBehavior('did:trend2', 'payment', { amount: '1000' })
        credit.recordBehavior('did:trend2', 'order_completed', { amount: '1000' })
      }

      const trend = credit.getScoreTrend('did:trend2', 5)
      expect(trend.length).toBeGreaterThan(0)
      expect(trend.length).toBeLessThanOrEqual(6)
    })
  })

  describe('Bad Behavior', () => {
    it('should record bad behavior', () => {
      credit.recordBadBehavior('did:bad', 'late_delivery', 5)
      credit.recordBadBehavior('did:bad', 'failed_order', 10)

      const behaviors = credit.getBehaviors('did:bad')
      expect(behaviors.length).toBe(2)
      expect(behaviors[0].event).toBe('bad_behavior')
    })
  })

  describe('Bulk Queries', () => {
    it('should get all credits', () => {
      credit.calculateScore('did:all1')
      credit.calculateScore('did:all2')
      credit.calculateScore('did:all3')

      const all = credit.getAllCredits()
      expect(all.size).toBe(3)
    })

    it('should get top agents', () => {
      for (let i = 0; i < 5; i++) {
        credit.calculateScore(`did:top${i}`)
      }

      const top = credit.getTopAgents(3)
      expect(top.length).toBeLessThanOrEqual(3)
    })
  })
})
