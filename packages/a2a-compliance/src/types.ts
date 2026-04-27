export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type ComplianceDecision = 'approved' | 'flagged' | 'blocked' | 'manual_review'

export interface ComplianceResult {
  decision: ComplianceDecision
  riskLevel: RiskLevel
  riskScore: number
  reasons: string[]
  timestamp: number
  auditRef: string
  flags: ComplianceFlag[]
}

export interface ComplianceFlag {
  code: string
  severity: RiskLevel
  description: string
  recommendation: string
}

export interface AuditEntry {
  id: string
  eventType: string
  agentDID: string
  productId: string
  data: Record<string, unknown>
  timestamp: number
  txHash?: string
  chainId?: string
}

export interface AuditReport {
  period: {
    start: number
    end: number
  }
  totalTransactions: number
  totalVolume: string
  totalFees: string
  flaggedTransactions: number
  complianceScore: number
  entries: AuditEntry[]
}

export interface TaxReport {
  period: string
  taxableAmount: string
  fees: string
  currency: string
  generatedAt: number
  jurisdiction: string
  transactions: TaxTransaction[]
}

export interface TaxTransaction {
  txHash: string
  amount: string
  fee: string
  timestamp: number
  counterparty: string
}
