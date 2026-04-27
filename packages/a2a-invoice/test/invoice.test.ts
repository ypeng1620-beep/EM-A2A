import { describe, it, expect, beforeEach } from 'vitest'
import { A2AInvoice } from '../src/invoice.js'

describe('A2AInvoice', () => {
  let invoice: A2AInvoice

  beforeEach(() => {
    invoice = new A2AInvoice()
  })

  describe('Invoice Creation', () => {
    it('should create a draft invoice with items', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [
          { description: 'Smart contract audit', quantity: 1, unitPrice: '500000000' },
          { description: 'Deployment script', quantity: 2, unitPrice: '100000000' },
        ],
        orderId: 'order_abc',
      })

      expect(inv.id).toMatch(/^inv_/)
      expect(inv.status).toBe('draft')
      expect(inv.items.length).toBe(2)
      expect(inv.subtotal).toBe('700000000') // 500M + 2*100M
      expect(inv.taxRate).toBe(0.06)
      expect(BigInt(inv.tax)).toBeGreaterThan(0n)
      expect(BigInt(inv.total)).toBeGreaterThan(BigInt(inv.subtotal))
    })

    it('should accept custom tax rate', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'API access', quantity: 1, unitPrice: '100000000' }],
        taxRate: 0.13,
      })

      expect(inv.taxRate).toBe(0.13)
      // 13% of 100M = 13M
      expect(inv.tax).toBe('13000000')
      expect(inv.total).toBe('113000000')
    })

    it('should reject empty items', () => {
      expect(() =>
        invoice.createInvoice({
          agentId: 'did:a',
          counterpartyId: 'did:b',
          items: [],
        }),
      ).toThrow('at least one item')
    })

    it('should default to USDC currency', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:a',
        counterpartyId: 'did:b',
        items: [{ description: 'Test', quantity: 1, unitPrice: '1000000' }],
      })
      expect(inv.currency).toBe('USDC')
    })
  })

  describe('Lifecycle', () => {
    it('should issue a draft invoice', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
      })

      const issued = invoice.issueInvoice(inv.id)
      expect(issued.status).toBe('issued')
    })

    it('should mark issued invoice as paid', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
      })
      invoice.issueInvoice(inv.id)

      const paid = invoice.markPaid(inv.id, '0xpay')
      expect(paid.status).toBe('paid')
      expect(paid.paidAt).toBeGreaterThan(0)
      expect(paid.txHash).toBe('0xpay')
    })

    it('should mark overdue invoice as paid', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
        dueDays: 1,
      })
      invoice.issueInvoice(inv.id)
      ;(invoice.getInvoice(inv.id) as any).dueAt = Date.now() - 1000
      invoice.processOverdue()

      const paid = invoice.markPaid(inv.id)
      expect(paid.status).toBe('paid')
    })

    it('should cancel a draft invoice', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
      })

      const cancelled = invoice.cancelInvoice(inv.id)
      expect(cancelled.status).toBe('cancelled')
    })

    it('should reject issuing non-draft invoice', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
      })
      invoice.issueInvoice(inv.id)

      expect(() => invoice.issueInvoice(inv.id)).toThrow('Cannot issue')
    })

    it('should reject cancelling paid invoice', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
      })
      invoice.issueInvoice(inv.id)
      invoice.markPaid(inv.id)

      expect(() => invoice.cancelInvoice(inv.id)).toThrow('Cannot cancel')
    })

    it('should process overdue invoices', () => {
      const inv1 = invoice.createInvoice({
        agentId: 'did:a',
        counterpartyId: 'did:b',
        items: [{ description: 'S1', quantity: 1, unitPrice: '100000000' }],
        dueDays: 1,
      })
      const inv2 = invoice.createInvoice({
        agentId: 'did:a',
        counterpartyId: 'did:c',
        items: [{ description: 'S2', quantity: 1, unitPrice: '200000000' }],
        dueDays: 30,
      })
      invoice.issueInvoice(inv1.id)
      invoice.issueInvoice(inv2.id)
      ;(invoice.getInvoice(inv1.id) as any).dueAt = Date.now() - 1000

      const overdue = invoice.processOverdue()
      expect(overdue).toContain(inv1.id)
      expect(invoice.getInvoice(inv1.id)!.status).toBe('overdue')
      expect(invoice.getInvoice(inv2.id)!.status).toBe('issued')
    })
  })

  describe('Tax Reports', () => {
    it('should generate tax report for paid invoices', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Service', quantity: 1, unitPrice: '100000000' }],
        taxRate: 0.06,
      })
      invoice.issueInvoice(inv.id)
      invoice.markPaid(inv.id)

      const report = invoice.generateTaxReport(
        'did:seller',
        Date.now() - 86400_000,
        Date.now() + 86400_000,
      )
      expect(report.invoiceCount).toBe(1)
      expect(report.totalRevenue).toBe('100000000')
      expect(BigInt(report.totalTax)).toBeGreaterThan(0n)
    })

    it('should exclude unpaid invoices from report', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:buyer',
        items: [{ description: 'Draft', quantity: 1, unitPrice: '100000000' }],
      })
      // Not issued, not paid

      const report = invoice.generateTaxReport(
        'did:seller',
        Date.now() - 86400_000,
        Date.now() + 86400_000,
      )
      expect(report.invoiceCount).toBe(0)
      expect(report.totalRevenue).toBe('0')
    })

    it('should include category breakdown by tax rate', () => {
      const inv1 = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:a',
        items: [{ description: 'Goods', quantity: 1, unitPrice: '50000000' }],
        taxRate: 0.06,
      })
      invoice.issueInvoice(inv1.id)
      invoice.markPaid(inv1.id)

      const inv2 = invoice.createInvoice({
        agentId: 'did:seller',
        counterpartyId: 'did:b',
        items: [{ description: 'Export', quantity: 1, unitPrice: '100000000' }],
        taxRate: 0.13,
      })
      invoice.issueInvoice(inv2.id)
      invoice.markPaid(inv2.id)

      const report = invoice.generateTaxReport(
        'did:seller',
        Date.now() - 86400_000,
        Date.now() + 86400_000,
      )
      expect(report.invoiceCount).toBe(2)
      expect(Object.keys(report.categoryBreakdown).length).toBe(2)
    })
  })

  describe('Queries', () => {
    it('should return agent invoices as holder or counterparty', () => {
      invoice.createInvoice({
        agentId: 'did:x',
        counterpartyId: 'did:y',
        items: [{ description: 'S1', quantity: 1, unitPrice: '100000000' }],
      })
      invoice.createInvoice({
        agentId: 'did:z',
        counterpartyId: 'did:x',
        items: [{ description: 'S2', quantity: 1, unitPrice: '200000000' }],
      })

      expect(invoice.getAgentInvoices('did:x').length).toBe(2)
      expect(invoice.getAgentInvoices('did:y').length).toBe(1)
    })

    it('should filter invoices by status', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:a',
        counterpartyId: 'did:b',
        items: [{ description: 'S', quantity: 1, unitPrice: '100000000' }],
      })
      invoice.issueInvoice(inv.id)

      expect(invoice.getAgentInvoices('did:a', 'draft').length).toBe(0)
      expect(invoice.getAgentInvoices('did:a', 'issued').length).toBe(1)
    })

    it('should return null for unknown invoice', () => {
      expect(invoice.getInvoice('inv_fake')).toBeNull()
    })

    it('should return overdue invoices', () => {
      const inv = invoice.createInvoice({
        agentId: 'did:a',
        counterpartyId: 'did:b',
        items: [{ description: 'Late', quantity: 1, unitPrice: '100000000' }],
        dueDays: 1,
      })
      invoice.issueInvoice(inv.id)
      ;(invoice.getInvoice(inv.id) as any).dueAt = Date.now() - 1000
      invoice.processOverdue()

      expect(invoice.getOverdueInvoices().length).toBe(1)
      expect(invoice.getOverdueInvoices('did:other').length).toBe(0)
    })
  })

  describe('Static Calculator', () => {
    it('should calculate tax without creating invoice', () => {
      const result = A2AInvoice.calculateTax('100000000', 0.06)
      expect(result.tax).toBe('6000000')
      expect(result.total).toBe('106000000')
    })

    it('should default to 6% tax', () => {
      const result = A2AInvoice.calculateTax('100000000')
      expect(result.tax).toBe('6000000')
    })
  })
})
