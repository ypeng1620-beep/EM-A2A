/**
 * Tax Reporter — 自动税务报告生成
 */

import type { AuditReport, TaxReport } from './types.js'

export type Jurisdiction = 'global' | 'us' | 'cn' | 'eu' | 'sg'

export class TaxReporter {
  generateReport(auditReport: AuditReport, jurisdiction: Jurisdiction = 'global'): TaxReport {
    const taxableAmount = auditReport.totalFees

    return {
      period: `${new Date(auditReport.period.start).toISOString()} ~ ${new Date(auditReport.period.end).toISOString()}`,
      taxableAmount,
      fees: ((BigInt(taxableAmount) * 30n) / 100n).toString(), // 30% tax estimate
      currency: 'USDC',
      generatedAt: Date.now(),
      jurisdiction,
      transactions: auditReport.entries
        .filter((e) => e.data.amount)
        .map((e) => ({
          txHash: e.txHash ?? '',
          amount: e.data.amount as string,
          fee: (e.data.fee as string) ?? '0',
          timestamp: e.timestamp,
          counterparty: (e.data.counterparty as string) ?? 'unknown',
        })),
    }
  }
}
