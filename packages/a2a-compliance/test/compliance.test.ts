import { describe, it, expect } from 'vitest'
import { KYAEngine } from '../src/kya.js'
import { AMLScanner } from '../src/aml.js'
import { AuditTrail } from '../src/auditTrail.js'
import { TaxReporter } from '../src/taxReporter.js'
import type { AgentIdentity } from '@poisonpyf/a2a-core'

function makeIdentity(did: string): AgentIdentity {
  return {
    did,
    address: 'TABC123',
    chain: 'tron',
    registeredAt: Date.now(),
    status: 'active',
    metadata: { name: 'TestAgent', category: ['coding'] },
    credentials: [],
  }
}

describe('KYAEngine', () => {
  it('should submit and verify an agent', () => {
    const kya = new KYAEngine()
    const identity = makeIdentity('did:bai:tron:test1')

    kya.submitForVerification(identity)
    kya.verify('did:bai:tron:test1', true)

    expect(kya.isVerified('did:bai:tron:test1')).toBe(true)
  })

  it('should reject unverified agent', () => {
    const kya = new KYAEngine()
    expect(kya.isVerified('did:bai:tron:unknown')).toBe(false)
  })

  it('should assess risk for new agent', () => {
    const kya = new KYAEngine()
    const identity = makeIdentity('did:bai:tron:new')
    const result = kya.assessRisk(identity)
    expect(result.riskScore).toBeGreaterThan(50) // new + no creds
    expect(result.decision).toBe('blocked')
  })

  it('should give lower risk to verified agent with credentials', () => {
    const kya = new KYAEngine()
    const identity = makeIdentity('did:bai:tron:good')
    identity.credentials = [
      {
        id: 'c1',
        type: 'code_audit',
        issuer: 'bai',
        holder: identity.did,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 365 * 86400000,
        status: 'active',
        metadata: {},
      },
      {
        id: 'c2',
        type: 'risk_controller',
        issuer: 'bai',
        holder: identity.did,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 365 * 86400000,
        status: 'active',
        metadata: {},
      },
      {
        id: 'c3',
        type: 'data_analyst',
        issuer: 'bai',
        holder: identity.did,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 365 * 86400000,
        status: 'active',
        metadata: {},
      },
    ]
    identity.registeredAt = Date.now() - 400 * 24 * 60 * 60 * 1000 // 400 days ago
    kya.submitForVerification(identity)
    kya.verify('did:bai:tron:good', true)

    const result = kya.assessRisk(identity)
    expect(result.riskScore).toBeLessThan(50)
  })
})

describe('AMLScanner', () => {
  it('should flag blacklisted counterparty', () => {
    const scanner = new AMLScanner()
    scanner.addToBlacklist('TBLACKLIST')
    const result = scanner.scanTransaction('did:a', '1000000', 'TBLACKLIST')
    expect(result.suspicious).toBe(true)
    expect(result.patterns.some((p) => p.name === 'blacklisted_counterparty')).toBe(true)
  })

  it('should pass clean transaction', () => {
    const scanner = new AMLScanner()
    const result = scanner.scanTransaction('did:a', '1000000', 'TCLEAN')
    expect(result.suspicious).toBe(false)
  })

  it('should detect structuring pattern', () => {
    const scanner = new AMLScanner()
    for (let i = 0; i < 15; i++) {
      scanner.recordTransaction('did:a', '50000000', 'TCLEAN')
    }
    const result = scanner.scanTransaction('did:a', '50000000', 'TCLEAN')
    expect(result.patterns.some((p) => p.name === 'structuring')).toBe(true)
  })
})

describe('AuditTrail', () => {
  it('should record and query entries', () => {
    const audit = new AuditTrail()
    audit.record('test_event', 'did:a', 'product_1', { amount: '100', fee: '1' })
    audit.record('test_event', 'did:b', 'product_1', { amount: '200', fee: '2' })

    const entries = audit.query('did:a')
    expect(entries.length).toBe(1)
    expect(entries[0].data.amount).toBe('100')
  })

  it('should generate audit report', () => {
    const audit = new AuditTrail()
    const now = Date.now()
    audit.record('test', 'did:a', 'p1', { amount: '100', fee: '5' }, '0xtx1')
    audit.record('test', 'did:b', 'p1', { amount: '200', fee: '10' }, '0xtx2')

    const report = audit.generateReport(now - 1000, now + 1000)
    expect(report.totalTransactions).toBe(2)
  })
})

describe('TaxReporter', () => {
  it('should generate tax report', () => {
    const reporter = new TaxReporter()
    const audit = new AuditTrail()
    const now = Date.now()
    audit.record('payment', 'did:a', 'pay', { amount: '1000000', fee: '10000' }, '0xtx1')
    const report = audit.generateReport(now - 1000, now + 1000)

    const tax = reporter.generateReport(report, 'global')
    expect(tax.jurisdiction).toBe('global')
    expect(tax.transactions.length).toBe(1)
    expect(tax.taxableAmount).toBe('10000')
  })
})
