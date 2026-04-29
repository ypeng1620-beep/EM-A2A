/**
 * AML Scanner — 反洗钱扫描引擎
 * 交易模式分析 + 风险评分
 */

import type { AgentDID } from '@poisonpyf/a2a-core'
import type { ComplianceResult } from './types.js'

export interface AMLResult {
  score: number
  suspicious: boolean
  patterns: AMLPattern[]
  timestamp: number
}

export interface AMLPattern {
  name: string
  confidence: number
  description: string
}

export class AMLScanner {
  private recentTransactions = new Map<AgentDID, AMLTransaction[]>()
  private blacklist = new Set<string>()

  addToBlacklist(address: string): void {
    this.blacklist.add(address.toLowerCase())
  }

  removeFromBlacklist(address: string): void {
    this.blacklist.delete(address.toLowerCase())
  }

  recordTransaction(did: AgentDID, amount: string, counterparty: string): void {
    const txs = this.recentTransactions.get(did) ?? []
    txs.push({
      amount: BigInt(amount),
      counterparty,
      timestamp: Date.now(),
    })

    // Keep last 100
    if (txs.length > 100) txs.shift()
    this.recentTransactions.set(did, txs)
  }

  scanTransaction(did: AgentDID, amount: string, counterparty: string): AMLResult {
    const patterns: AMLPattern[] = []

    // Check blacklist
    if (this.blacklist.has(counterparty.toLowerCase())) {
      patterns.push({
        name: 'blacklisted_counterparty',
        confidence: 1.0,
        description: 'Counterparty is on sanction blacklist',
      })
    }

    // Check recent transaction patterns
    const recent = this.recentTransactions.get(did) ?? []
    const windowMs = 60 * 60 * 1000 // 1 hour
    const recentWindow = recent.filter((tx) => Date.now() - tx.timestamp < windowMs)

    // Structuring (many small transactions)
    const amountValue = Number(amount) / 1e6
    if (amountValue > 0 && amountValue < 100) {
      const smallTxCount = recentWindow.filter((tx) => {
        const txAmount = Number(tx.amount) / 1e6
        return txAmount > 0 && txAmount < 100
      }).length
      if (smallTxCount > 10) {
        patterns.push({
          name: 'structuring',
          confidence: Math.min(smallTxCount / 20, 1.0),
          description: `Structing: ${smallTxCount} sub-$100 transactions in 1h`,
        })
      }
    }

    // Rapid transactions
    if (recentWindow.length > 20) {
      patterns.push({
        name: 'rapid_transactions',
        confidence: Math.min(recentWindow.length / 30, 1.0),
        description: `Rapid transactions: ${recentWindow.length} in 1h`,
      })
    }

    // Large amount
    if (amountValue > 100_000) {
      patterns.push({
        name: 'large_transaction',
        confidence: 0.5,
        description: `Large transaction: $${amountValue.toLocaleString()}`,
      })
    }

    const suspicious = patterns.some((p) => p.confidence > 0.7)
    const score = Math.min(
      100,
      patterns.reduce((sum, p) => sum + p.confidence * 30, suspicious ? 40 : 0),
    )

    return {
      score,
      suspicious,
      patterns,
      timestamp: Date.now(),
    }
  }

  clearHistory(did: AgentDID): void {
    this.recentTransactions.delete(did)
  }
}

interface AMLTransaction {
  amount: bigint
  counterparty: string
  timestamp: number
}
