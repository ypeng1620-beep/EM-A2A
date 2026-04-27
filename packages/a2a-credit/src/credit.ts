/**
 * A2A Credit — Agent Credit Scoring
 *
 * Core features:
 *   1. Behavior collection (payments, completions, disputes)
 *   2. Credit score calculation (300-950)
 *   3. In-memory storage (default) or SQLite persistence
 *   4. Bad behavior recording + trend tracking
 *
 * Monetization: query fee $0.01/call + certification fee + data revenue share
 */

import { randomUUID } from 'crypto'
import {
  calculateCreditScore,
  getCreditLevel,
  type AgentDID,
  type CreditScore,
  type CreditRecord,
  type CreditLevel,
  type CreditFactors,
} from '@em/a2a-core'

export interface BehaviorRecord {
  id: string
  did: AgentDID
  event: string
  data: Record<string, unknown>
  timestamp: number
  txHash?: string
}

export interface A2ACreditConfig {
  dbPath?: string
  queryPrice?: string
}

interface StoredScore {
  score: number
  level: CreditLevel
  factors: CreditFactors
  updatedAt: number
}

export class A2ACredit {
  private behaviors: Map<AgentDID, BehaviorRecord[]>
  private scores: Map<AgentDID, StoredScore>
  private history: Map<AgentDID, CreditRecord[]>
  private queryPrice: string
  private sqlite: any = null

  constructor(config: A2ACreditConfig = {}) {
    this.behaviors = new Map()
    this.scores = new Map()
    this.history = new Map()
    this.queryPrice = config.queryPrice ?? '10000'

    // Optional SQLite persistence
    if (config.dbPath && config.dbPath !== ':memory:') {
      try {
        const Database = require('better-sqlite3')
        this.sqlite = new Database(config.dbPath)
        this.initSQLite()
        this.loadFromSQLite()
      } catch {
        console.warn('[A2A-Credit] better-sqlite3 not available, using in-memory storage')
      }
    }
  }

  private initSQLite(): void {
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS credit_behaviors (
        id TEXT PRIMARY KEY, did TEXT NOT NULL, event TEXT NOT NULL,
        data TEXT DEFAULT '{}', timestamp INTEGER NOT NULL, tx_hash TEXT
      );
      CREATE TABLE IF NOT EXISTS credit_scores (
        did TEXT PRIMARY KEY, score INTEGER NOT NULL, level TEXT NOT NULL,
        factors TEXT DEFAULT '{}', updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS credit_history (
        id TEXT PRIMARY KEY, did TEXT NOT NULL, score INTEGER NOT NULL,
        event TEXT NOT NULL, delta INTEGER DEFAULT 0, timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cb_did ON credit_behaviors(did);
      CREATE INDEX IF NOT EXISTS idx_ch_did ON credit_history(did);
    `)
  }

  private loadFromSQLite(): void {
    if (!this.sqlite) return
    const scores = this.sqlite.prepare('SELECT * FROM credit_scores').all() as any[]
    for (const s of scores) {
      this.scores.set(s.did, {
        score: s.score,
        level: s.level as CreditLevel,
        factors: JSON.parse(s.factors),
        updatedAt: s.updated_at,
      })
    }
  }

  // =========================================================================
  // Behavior Recording
  // =========================================================================

  recordBehavior(
    did: AgentDID,
    event: string,
    data: Record<string, unknown>,
    txHash?: string,
  ): BehaviorRecord {
    const record: BehaviorRecord = {
      id: randomUUID(),
      did,
      event,
      data,
      timestamp: Date.now(),
      txHash,
    }

    const records = this.behaviors.get(did) ?? []
    records.push(record)
    if (records.length > 1000) records.shift()
    this.behaviors.set(did, records)

    if (this.sqlite) {
      this.sqlite.prepare(
        'INSERT INTO credit_behaviors (id, did, event, data, timestamp, tx_hash) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(record.id, did, event, JSON.stringify(data), record.timestamp, txHash ?? null)
    }

    // Auto-recalculate
    this.calculateScore(did)
    return record
  }

  // =========================================================================
  // Credit Score
  // =========================================================================

  calculateScore(did: AgentDID): CreditScore {
    const records = this.behaviors.get(did) ?? []

    const transactionVolume = records.filter(r => r.event === 'payment').length
    const completions = records.filter(r => r.event === 'order_completed').length
    const disputes = records.filter(r => r.event === 'order_disputed').length
    const totalOrders = completions + disputes

    const completionRate = totalOrders > 0 ? completions / totalOrders : 0.5
    const disputeRate = totalOrders > 0 ? disputes / totalOrders : 0

    const firstRecord = records[0]
    const accountAge = firstRecord ? Date.now() - firstRecord.timestamp : 0

    const credentials = records.filter(r => r.event === 'credential_issued').length

    const factors: CreditFactors = {
      transactionVolume,
      completionRate,
      disputeRate,
      accountAge,
      credentialCount: credentials,
    }

    const score = calculateCreditScore(factors)
    const level: CreditLevel = getCreditLevel(score)

    const existing = this.scores.get(did)
    const delta = existing ? score - existing.score : 0

    this.scores.set(did, { score, level, factors, updatedAt: Date.now() })

    const record: CreditRecord = {
      timestamp: Date.now(),
      score,
      event: 'score_update',
      delta,
    }

    const hist = this.history.get(did) ?? []
    hist.push(record)
    if (hist.length > 100) hist.shift()
    this.history.set(did, hist)

    if (this.sqlite) {
      this.sqlite.prepare(`
        INSERT INTO credit_scores (did, score, level, factors, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(did) DO UPDATE SET score=excluded.score, level=excluded.level,
          factors=excluded.factors, updated_at=excluded.updated_at
      `).run(did, score, level, JSON.stringify(factors), Date.now())

      this.sqlite.prepare(
        'INSERT INTO credit_history (id, did, score, event, delta, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), did, score, 'score_update', delta, Date.now())
    }

    return { did, score, level, updatedAt: Date.now(), factors, history: hist }
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getCreditScore(did: AgentDID): CreditScore | null {
    const stored = this.scores.get(did)
    if (!stored) return null
    return {
      did,
      score: stored.score,
      level: stored.level,
      updatedAt: stored.updatedAt,
      factors: stored.factors,
      history: this.history.get(did) ?? [],
    }
  }

  getCreditLevel(did: AgentDID): CreditLevel {
    return this.scores.get(did)?.level ?? 'none'
  }

  getBehaviors(did: AgentDID, limit = 50): BehaviorRecord[] {
    const records = this.behaviors.get(did) ?? []
    return records.slice(-limit)
  }

  getCreditHistory(did: AgentDID, limit = 100): CreditRecord[] {
    const hist = this.history.get(did) ?? []
    return hist.slice(-limit)
  }

  getScoreTrend(did: AgentDID, periods = 10): { timestamp: number; score: number }[] {
    const hist = this.history.get(did) ?? []
    if (hist.length <= periods) return hist.map(h => ({ timestamp: h.timestamp, score: h.score }))

    const step = Math.floor(hist.length / periods)
    const sampled: { timestamp: number; score: number }[] = []
    for (let i = 0; i < hist.length; i += step) {
      sampled.push({ timestamp: hist[i].timestamp, score: hist[i].score })
    }
    if (sampled[sampled.length - 1] !== hist[hist.length - 1]) {
      sampled.push({ timestamp: hist[hist.length - 1].timestamp, score: hist[hist.length - 1].score })
    }
    return sampled
  }

  // =========================================================================
  // Bad Behavior
  // =========================================================================

  recordBadBehavior(did: AgentDID, reason: string, severity: number): void {
    this.recordBehavior(did, 'bad_behavior', { reason, severity })
  }

  // =========================================================================
  // Bulk
  // =========================================================================

  getAllCredits(): Map<AgentDID, CreditScore> {
    const result = new Map<AgentDID, CreditScore>()
    for (const [did, stored] of this.scores) {
      result.set(did, {
        did,
        score: stored.score,
        level: stored.level,
        updatedAt: stored.updatedAt,
        factors: stored.factors,
        history: this.history.get(did) ?? [],
      })
    }
    return result
  }

  getTopAgents(limit = 10): CreditScore[] {
    return [...this.scores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([did, stored]) => ({
        did,
        score: stored.score,
        level: stored.level,
        updatedAt: stored.updatedAt,
        factors: stored.factors,
        history: [],
      }))
  }

  close(): void {
    if (this.sqlite) this.sqlite.close()
  }
}
