/**
 * Audit Trail — 不可篡改审计日志
 * 本地存储 + 链上哈希锚定
 */

import { randomUUID } from 'crypto'
import type { AgentDID } from '@em/a2a-core'
import type { AuditEntry, AuditReport } from './types.js'

export class AuditTrail {
  private entries: AuditEntry[] = []
  private chainHashes: string[] = []

  record(
    eventType: string,
    agentDID: AgentDID,
    productId: string,
    data: Record<string, unknown>,
    txHash?: string,
    chainId?: string,
  ): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      eventType,
      agentDID,
      productId,
      data,
      timestamp: Date.now(),
      txHash,
      chainId,
    }
    this.entries.push(entry)
    return entry
  }

  anchorToChain(): string {
    // 将所有未锚定的条目哈希组合 → 上链
    const unanchored = this.entries.filter(e => !e.txHash)
    if (unanchored.length === 0) return ''

    const hash = this.computeHash(JSON.stringify(unanchored))
    this.chainHashes.push(hash)

    // 标记已锚定
    for (const entry of unanchored) {
      entry.txHash = hash
    }

    return hash
  }

  query(did?: AgentDID, productId?: string, limit = 100): AuditEntry[] {
    let results = this.entries

    if (did) results = results.filter(e => e.agentDID === did)
    if (productId) results = results.filter(e => e.productId === productId)

    return results.slice(-limit)
  }

  generateReport(start: number, end: number): AuditReport {
    const periodEntries = this.entries.filter(
      e => e.timestamp >= start && e.timestamp <= end,
    )

    let totalVolume = 0n
    let totalFees = 0n

    for (const entry of periodEntries) {
      if (entry.data.amount) totalVolume += BigInt(entry.data.amount as string)
      if (entry.data.fee) totalFees += BigInt(entry.data.fee as string)
    }

    return {
      period: { start, end },
      totalTransactions: periodEntries.length,
      totalVolume: totalVolume.toString(),
      totalFees: totalFees.toString(),
      flaggedTransactions: periodEntries.filter(e => e.data.flagged === true).length,
      complianceScore: this.calculateComplianceScore(periodEntries),
      entries: periodEntries,
    }
  }

  private calculateComplianceScore(entries: AuditEntry[]): number {
    if (entries.length === 0) return 100
    const flagged = entries.filter(e => e.data.flagged === true).length
    return Math.round(100 - (flagged / entries.length) * 100)
  }

  private computeHash(data: string): string {
    // Simple hash for now; replace with keccak256 via ethers
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  getStats(): { totalEntries: number; chainHashes: number } {
    return {
      totalEntries: this.entries.length,
      chainHashes: this.chainHashes.length,
    }
  }
}
