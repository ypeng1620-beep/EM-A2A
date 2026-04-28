/**
 * A2A Invoice — Agent 自动结算 & 税务报告
 *
 * 对标支付宝电子发票 + 生活缴费：
 *   1. 自动生成发票（含明细项 + 税率计算）
 *   2. 发票生命周期：draft → issued → paid（→ overdue → cancelled）
 *   3. 税务汇总报告（按周期/类别汇总）
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: string
  total: string
}

export interface Invoice {
  id: string
  agentId: string
  counterpartyId: string
  items: InvoiceItem[]
  subtotal: string
  taxRate: number
  tax: string
  total: string
  currency: string
  status: InvoiceStatus
  orderId?: string
  createdAt: number
  dueAt: number
  paidAt: number | null
  txHash?: string
}

export interface TaxReport {
  period: { start: number; end: number }
  totalRevenue: string
  totalTax: string
  invoiceCount: number
  categoryBreakdown: Record<string, { count: number; revenue: string; tax: string }>
}

export interface A2AInvoiceConfig {
  defaultTaxRate?: number // 默认 0.06 (6%)
  defaultDueDays?: number // 默认 30
}

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
  return ((BigInt(amount) * BigInt(Math.round(ratio * 1_000_000))) / 1_000_000n).toString()
}

// ---------------------------------------------------------------------------
// A2A Invoice
// ---------------------------------------------------------------------------

export class A2AInvoice {
  private invoices: Map<string, Invoice>
  private defaultTaxRate: number
  private defaultDueDays: number

  constructor(config: A2AInvoiceConfig = {}) {
    this.invoices = new Map()
    this.defaultTaxRate = config.defaultTaxRate ?? 0.06
    this.defaultDueDays = config.defaultDueDays ?? 30
  }

  // =========================================================================
  // Invoice Creation
  // =========================================================================

  createInvoice(params: {
    agentId: string
    counterpartyId: string
    items: { description: string; quantity: number; unitPrice: string }[]
    currency?: string
    taxRate?: number
    dueDays?: number
    orderId?: string
  }): Invoice {
    if (params.items.length === 0) {
      throw new Error('Invoice must have at least one item')
    }

    const taxRate = params.taxRate ?? this.defaultTaxRate
    const dueDays = params.dueDays ?? this.defaultDueDays

    const lineItems: InvoiceItem[] = params.items.map((item) => {
      const total = (BigInt(item.unitPrice) * BigInt(item.quantity)).toString()
      return { ...item, total }
    })

    const subtotal = lineItems.reduce((sum, item) => bigAdd(sum, item.total), '0')
    const tax = bigMulRatio(subtotal, taxRate)
    const total = bigAdd(subtotal, tax)

    const invoice: Invoice = {
      id: `inv_${randomUUID().slice(0, 8)}`,
      agentId: params.agentId,
      counterpartyId: params.counterpartyId,
      items: lineItems,
      subtotal,
      taxRate,
      tax,
      total,
      currency: params.currency ?? 'USDC',
      status: 'draft',
      orderId: params.orderId,
      createdAt: Date.now(),
      dueAt: Date.now() + dueDays * 86400_000,
      paidAt: null,
    }

    this.invoices.set(invoice.id, invoice)
    return invoice
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  issueInvoice(invoiceId: string): Invoice {
    const inv = this.mustGet(invoiceId)
    if (inv.status !== 'draft') {
      throw new Error(`Cannot issue invoice with status: ${inv.status}`)
    }
    inv.status = 'issued'
    return inv
  }

  markPaid(invoiceId: string, txHash?: string): Invoice {
    const inv = this.mustGet(invoiceId)
    if (inv.status !== 'issued' && inv.status !== 'overdue') {
      throw new Error(`Cannot mark paid with status: ${inv.status}`)
    }
    inv.status = 'paid'
    inv.paidAt = Date.now()
    if (txHash) inv.txHash = txHash
    return inv
  }

  cancelInvoice(invoiceId: string): Invoice {
    const inv = this.mustGet(invoiceId)
    if (inv.status === 'paid') {
      throw new Error('Cannot cancel a paid invoice')
    }
    inv.status = 'cancelled'
    return inv
  }

  processOverdue(): string[] {
    const now = Date.now()
    const overdue: string[] = []
    for (const inv of this.invoices.values()) {
      if (inv.status === 'issued' && now > inv.dueAt) {
        inv.status = 'overdue'
        overdue.push(inv.id)
      }
    }
    return overdue
  }

  // =========================================================================
  // Tax Reports
  // =========================================================================

  generateTaxReport(agentId: string, startDate: number, endDate: number): TaxReport {
    const invs = [...this.invoices.values()].filter(
      (inv) =>
        inv.agentId === agentId &&
        inv.status === 'paid' &&
        inv.paidAt !== null &&
        inv.paidAt >= startDate &&
        inv.paidAt <= endDate,
    )

    const report: TaxReport = {
      period: { start: startDate, end: endDate },
      totalRevenue: '0',
      totalTax: '0',
      invoiceCount: 0,
      categoryBreakdown: {},
    }

    for (const inv of invs) {
      report.totalRevenue = bigAdd(report.totalRevenue, inv.subtotal)
      report.totalTax = bigAdd(report.totalTax, inv.tax)
      report.invoiceCount++

      const cat = `rate_${Math.round(inv.taxRate * 100)}`
      if (!report.categoryBreakdown[cat]) {
        report.categoryBreakdown[cat] = { count: 0, revenue: '0', tax: '0' }
      }
      report.categoryBreakdown[cat].count++
      report.categoryBreakdown[cat].revenue = bigAdd(
        report.categoryBreakdown[cat].revenue,
        inv.subtotal,
      )
      report.categoryBreakdown[cat].tax = bigAdd(report.categoryBreakdown[cat].tax, inv.tax)
    }

    return report
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getInvoice(invoiceId: string): Invoice | null {
    return this.invoices.get(invoiceId) ?? null
  }

  getAgentInvoices(agentId: string, status?: InvoiceStatus): Invoice[] {
    const all = [...this.invoices.values()].filter(
      (inv) => inv.agentId === agentId || inv.counterpartyId === agentId,
    )
    return status ? all.filter((inv) => inv.status === status) : all
  }

  getOverdueInvoices(agentId?: string): Invoice[] {
    const overdue = [...this.invoices.values()].filter((inv) => inv.status === 'overdue')
    return agentId ? overdue.filter((inv) => inv.agentId === agentId) : overdue
  }

  /** 静态税费计算器 — 不需创建发票即可估算税额 */
  static calculateTax(amount: string, taxRate: number = 0.06): { tax: string; total: string } {
    const tax = bigMulRatio(amount, taxRate)
    const total = bigAdd(amount, tax)
    return { tax, total }
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private mustGet(invoiceId: string): Invoice {
    const inv = this.invoices.get(invoiceId)
    if (!inv) throw new Error(`Invoice not found: ${invoiceId}`)
    return inv
  }
}

export default A2AInvoice
