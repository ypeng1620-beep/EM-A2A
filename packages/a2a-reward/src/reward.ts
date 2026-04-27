/**
 * A2A Reward — Agent 行为激励 & 积分经济
 *
 * 对标蚂蚁森林：
 *   1. 积分发放（交易完成、推荐、里程碑）
 *   2. 积分消费（兑换权益、抵扣手续费）
 *   3. 成就系统（徽章自动解锁）
 *   4. 排行榜
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PointSource = 'transaction' | 'referral' | 'milestone' | 'staking' | 'bonus'
export type TransactionType = 'earn' | 'redeem' | 'expire' | 'bonus'

export interface RewardPoints {
  agentId: string
  total: string
  available: string
  pending: string
  level: number
  levelName: string
}

export interface PointTransaction {
  id: string
  agentId: string
  amount: string
  type: TransactionType
  source: PointSource
  description: string
  createdAt: number
  expiresAt?: number
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  criteria: { type: 'total_points' | 'transactions' | 'referrals' | 'streak_days'; threshold: number }
}

export interface LeaderboardEntry {
  agentId: string
  totalPoints: string
  rank: number
  level: number
}

export interface RedemptionOption {
  id: string
  name: string
  description: string
  pointsCost: string
  benefit: string
  active: boolean
}

export interface A2ARewardConfig {
  pointsPerTransaction?: string  // 每次交易基础积分
  referralBonus?: string         // 推荐奖励积分
  milestoneBonus?: string        // 里程碑奖励积分
  expiryDays?: number            // 积分过期天数 (365)
}

// ---------------------------------------------------------------------------
// Level definitions
// ---------------------------------------------------------------------------

const LEVELS = [
  { level: 0, name: '铜牌', min: 0n },
  { level: 1, name: '银牌', min: 1000n },
  { level: 2, name: '金牌', min: 10000n },
  { level: 3, name: '铂金', min: 100000n },
  { level: 4, name: '钻石', min: 1000000n },
]

// ---------------------------------------------------------------------------
// Default achievements
// ---------------------------------------------------------------------------

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  { id: 'first_trade', name: '初次交易', description: '完成第一笔 Agent 交易', icon: '🤝', criteria: { type: 'transactions', threshold: 1 } },
  { id: 'power_trader', name: '交易达人', description: '累计完成 100 笔交易', icon: '📈', criteria: { type: 'transactions', threshold: 100 } },
  { id: 'whale', name: '积分巨鲸', description: '累计获得 100000 积分', icon: '🐋', criteria: { type: 'total_points', threshold: 100000 } },
  { id: 'millionaire', name: '百万富翁', description: '累计获得 1000000 积分', icon: '💎', criteria: { type: 'total_points', threshold: 1000000 } },
  { id: 'networker', name: '社交达人', description: '成功推荐 10 个 Agent', icon: '🌐', criteria: { type: 'referrals', threshold: 10 } },
  { id: 'dedicated', name: '坚持不懈', description: '连续活跃 30 天', icon: '🔥', criteria: { type: 'streak_days', threshold: 30 } },
]

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
  return (BigInt(amount) * BigInt(Math.round(ratio * 1_000_000)) / 1_000_000n).toString()
}

// ---------------------------------------------------------------------------
// A2A Reward
// ---------------------------------------------------------------------------

export class A2AReward {
  private balances: Map<string, RewardPoints>
  private transactions: Map<string, PointTransaction[]>
  private achievements: Achievement[]
  private agentAchievements: Map<string, Set<string>>
  private redemptionOptions: Map<string, RedemptionOption>
  private agentStats: Map<string, { transactions: number; referrals: number; streakDays: number; lastActive: number }>
  private pointsPerTransaction: string
  private referralBonus: string
  private milestoneBonus: string
  private expiryDays: number

  constructor(config: A2ARewardConfig = {}) {
    this.balances = new Map()
    this.transactions = new Map()
    this.achievements = [...DEFAULT_ACHIEVEMENTS]
    this.agentAchievements = new Map()
    this.redemptionOptions = new Map()
    this.agentStats = new Map()
    this.pointsPerTransaction = config.pointsPerTransaction ?? '100'
    this.referralBonus = config.referralBonus ?? '500'
    this.milestoneBonus = config.milestoneBonus ?? '1000'
    this.expiryDays = config.expiryDays ?? 365
  }

  // =========================================================================
  // Points Earning
  // =========================================================================

  earnPoints(
    agentId: string,
    amount: string,
    source: PointSource,
    description: string,
  ): PointTransaction {
    if (BigInt(amount) <= 0n) {
      throw new Error('Amount must be positive')
    }

    const tx: PointTransaction = {
      id: `pt_${randomUUID().slice(0, 8)}`,
      agentId,
      amount,
      type: 'earn',
      source,
      description,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.expiryDays * 86400_000,
    }

    this.addTransaction(agentId, tx)
    this.updateBalance(agentId, amount, 'add')

    // Update stats
    const stats = this.getOrCreateStats(agentId)
    stats.transactions++
    stats.lastActive = Date.now()

    return tx
  }

  /** 交易完成后自动发放积分 */
  awardTransactionPoints(agentId: string, txAmount?: string): PointTransaction {
    let points = this.pointsPerTransaction
    // Bonus: 0.1% of transaction amount as extra points
    if (txAmount) {
      points = bigAdd(points, bigMulRatio(txAmount, 0.001))
    }
    return this.earnPoints(agentId, points, 'transaction', '交易奖励积分')
  }

  /** 推荐新 Agent 奖励 */
  awardReferralPoints(agentId: string, referredAgentId: string): PointTransaction {
    const stats = this.getOrCreateStats(agentId)
    stats.referrals++

    return this.earnPoints(agentId, this.referralBonus, 'referral', `推荐 Agent: ${referredAgentId}`)
  }

  /** 达里程碑（交易量/积分）时发放奖励 */
  awardMilestonePoints(agentId: string, milestone: string): PointTransaction {
    return this.earnPoints(agentId, this.milestoneBonus, 'milestone', `达成里程碑: ${milestone}`)
  }

  // =========================================================================
  // Points Redemption
  // =========================================================================

  redeemPoints(agentId: string, optionId: string): PointTransaction {
    const option = this.redemptionOptions.get(optionId)
    if (!option) throw new Error(`Redemption option not found: ${optionId}`)
    if (!option.active) throw new Error(`Redemption option is not active: ${optionId}`)

    const balance = this.getOrCreateBalance(agentId)
    if (BigInt(balance.available) < BigInt(option.pointsCost)) {
      throw new Error(`Insufficient points: have ${balance.available}, need ${option.pointsCost}`)
    }

    const tx: PointTransaction = {
      id: `pt_${randomUUID().slice(0, 8)}`,
      agentId,
      amount: option.pointsCost,
      type: 'redeem',
      source: 'bonus',
      description: `兑换: ${option.name} — ${option.benefit}`,
      createdAt: Date.now(),
    }

    this.addTransaction(agentId, tx)
    this.updateBalance(agentId, option.pointsCost, 'subtract')

    return tx
  }

  // =========================================================================
  // Expiry
  // =========================================================================

  processExpiry(): number {
    const now = Date.now()
    let expiredCount = 0

    for (const [agentId, txs] of this.transactions) {
      for (const tx of txs) {
        if (tx.type === 'earn' && tx.expiresAt && now > tx.expiresAt) {
          const balance = this.getOrCreateBalance(agentId)
          const pendingExpire = BigInt(tx.amount)

          // Only expire if agent still has this amount available
          if (BigInt(balance.available) >= pendingExpire) {
            tx.type = 'expire'
            this.updateBalance(agentId, tx.amount, 'subtract')
            expiredCount++
          }
        }
      }
    }

    return expiredCount
  }

  // =========================================================================
  // Achievements
  // =========================================================================

  registerAchievement(achievement: Achievement): void {
    const idx = this.achievements.findIndex(a => a.id === achievement.id)
    if (idx >= 0) {
      this.achievements[idx] = achievement
    } else {
      this.achievements.push(achievement)
    }
  }

  checkAchievements(agentId: string): Achievement[] {
    const stats = this.getOrCreateStats(agentId)
    const balance = this.getOrCreateBalance(agentId)
    const unlocked = this.agentAchievements.get(agentId) ?? new Set()

    const newlyUnlocked: Achievement[] = []

    for (const ach of this.achievements) {
      if (unlocked.has(ach.id)) continue

      let qualified = false
      switch (ach.criteria.type) {
        case 'total_points':
          qualified = BigInt(balance.total) >= BigInt(ach.criteria.threshold)
          break
        case 'transactions':
          qualified = stats.transactions >= ach.criteria.threshold
          break
        case 'referrals':
          qualified = stats.referrals >= ach.criteria.threshold
          break
        case 'streak_days':
          qualified = stats.streakDays >= ach.criteria.threshold
          break
      }

      if (qualified) {
        unlocked.add(ach.id)
        newlyUnlocked.push(ach)
      }
    }

    if (newlyUnlocked.length > 0) {
      this.agentAchievements.set(agentId, unlocked)
    }

    return newlyUnlocked
  }

  getAgentAchievements(agentId: string): Achievement[] {
    const unlocked = this.agentAchievements.get(agentId) ?? new Set()
    return this.achievements.filter(a => unlocked.has(a.id))
  }

  getAllAchievements(): Achievement[] {
    return [...this.achievements]
  }

  // =========================================================================
  // Redemption Options
  // =========================================================================

  createRedemptionOption(params: {
    name: string
    description: string
    pointsCost: string
    benefit: string
  }): RedemptionOption {
    const option: RedemptionOption = {
      id: `ro_${randomUUID().slice(0, 8)}`,
      name: params.name,
      description: params.description,
      pointsCost: params.pointsCost,
      benefit: params.benefit,
      active: true,
    }

    this.redemptionOptions.set(option.id, option)
    return option
  }

  deactivateOption(optionId: string): RedemptionOption {
    const opt = this.redemptionOptions.get(optionId)
    if (!opt) throw new Error(`Redemption option not found: ${optionId}`)
    opt.active = false
    return opt
  }

  getRedemptionOptions(activeOnly: boolean = true): RedemptionOption[] {
    const all = [...this.redemptionOptions.values()]
    return activeOnly ? all.filter(o => o.active) : all
  }

  // =========================================================================
  // Leaderboard
  // =========================================================================

  getLeaderboard(limit: number = 10): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = []

    for (const [agentId, balance] of this.balances) {
      entries.push({
        agentId,
        totalPoints: balance.total,
        rank: 0,
        level: balance.level,
      })
    }

    entries.sort((a, b) => {
      const diff = BigInt(b.totalPoints) - BigInt(a.totalPoints)
      if (diff > 0n) return 1
      if (diff < 0n) return -1
      return 0
    })

    entries.forEach((e, i) => {
      e.rank = i + 1
    })

    return entries.slice(0, limit)
  }

  // =========================================================================
  // Streak
  // =========================================================================

  /** 应每日调用一次以维护连续活跃天数 */
  checkIn(agentId: string): { streakDays: number; bonus: string } {
    const stats = this.getOrCreateStats(agentId)
    const now = Date.now()
    const oneDay = 86400_000

    if (stats.lastActive > 0 && now - stats.lastActive < oneDay * 2) {
      if (now - stats.lastActive >= oneDay) {
        stats.streakDays++
      }
    } else if (stats.lastActive === 0 || now - stats.lastActive >= oneDay * 2) {
      stats.streakDays = 1
    }
    stats.lastActive = now

    // Streak bonus: extra points for long streaks
    const bonus = stats.streakDays >= 7
      ? bigMulRatio(this.pointsPerTransaction, 0.5 * Math.min(stats.streakDays / 7, 10))
      : '0'

    if (BigInt(bonus) > 0n) {
      this.earnPoints(agentId, bonus, 'bonus', `连续活跃 ${stats.streakDays} 天奖励`)
    }

    return { streakDays: stats.streakDays, bonus }
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getBalance(agentId: string): RewardPoints {
    return this.getOrCreateBalance(agentId)
  }

  getTransactions(agentId: string, limit?: number): PointTransaction[] {
    const txs = this.transactions.get(agentId) ?? []
    const sorted = [...txs].sort((a, b) => b.createdAt - a.createdAt)
    return limit ? sorted.slice(0, limit) : sorted
  }

  getTotalPointsIssued(): string {
    let total = '0'
    for (const balance of this.balances.values()) {
      total = bigAdd(total, balance.total)
    }
    return total
  }

  getActiveAgentCount(): number {
    return this.balances.size
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private getOrCreateBalance(agentId: string): RewardPoints {
    let balance = this.balances.get(agentId)
    if (!balance) {
      balance = {
        agentId,
        total: '0',
        available: '0',
        pending: '0',
        level: 0,
        levelName: '铜牌',
      }
      this.balances.set(agentId, balance)
    }
    return balance
  }

  private getOrCreateStats(agentId: string) {
    let stats = this.agentStats.get(agentId)
    if (!stats) {
      stats = { transactions: 0, referrals: 0, streakDays: 0, lastActive: 0 }
      this.agentStats.set(agentId, stats)
    }
    return stats
  }

  private addTransaction(agentId: string, tx: PointTransaction): void {
    const txs = this.transactions.get(agentId) ?? []
    txs.push(tx)
    this.transactions.set(agentId, txs)
  }

  private updateBalance(agentId: string, amount: string, op: 'add' | 'subtract'): void {
    const balance = this.getOrCreateBalance(agentId)
    if (op === 'add') {
      balance.total = bigAdd(balance.total, amount)
      balance.available = bigAdd(balance.available, amount)
    } else {
      balance.available = bigSub(balance.available, amount)
    }

    // Update level
    const totalBI = BigInt(balance.total)
    const newLevel = LEVELS.reduce((best, l) => (totalBI >= l.min ? l : best), LEVELS[0])
    balance.level = newLevel.level
    balance.levelName = newLevel.name
  }
}

export default A2AReward
