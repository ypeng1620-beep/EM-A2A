import { describe, it, expect } from 'vitest'
import { RevenueEngine } from '../src/revenue/engine.js'
import { FixedTierRevenue } from '../src/revenue/fixedTier.js'
import { VariableFloatRevenue } from '../src/revenue/variableFloat.js'
import { calculateCreditScore, getCreditLevel, generateDID, parseDID, createPaymentRequest, validatePaymentRequest } from '../src/index.js'

describe('RevenueEngine', () => {
  it('should calculate fee with fixed tier mode', () => {
    const engine = new RevenueEngine({ mode: 'fixed_tier' })
    const result = engine.calculateFee('1000000') // $1 USDC
    expect(result.mode).toBe('fixed_tier')
    expect(result.rate).toBe(0.01)
    expect(result.fee).toBe('10000')
  })

  it('should calculate fee with variable float mode', () => {
    const engine = new RevenueEngine({ mode: 'variable_float' })
    const result = engine.calculateFee('1000000', { riskScore: 30, creditScore: 800, transactionType: 'standard' })
    expect(result.mode).toBe('variable_float')
  })

  it('should switch modes', () => {
    const engine = new RevenueEngine({ mode: 'fixed_tier' })
    expect(engine.getMode()).toBe('fixed_tier')
    engine.setMode('variable_float')
    expect(engine.getMode()).toBe('variable_float')
  })
})

describe('FixedTierRevenue', () => {
  it('should apply default tier 1%', () => {
    const ft = new FixedTierRevenue()
    const result = ft.calculateFee('1000000')
    expect(result.rate).toBe(0.01)
  })

  it('should downgrade rate with higher volume', () => {
    const ft = new FixedTierRevenue({
      tiers: [
        { monthlyVolumeUSD: 0, rate: 0.01 },
        { monthlyVolumeUSD: 50000, rate: 0.008 },
      ],
    })
    ft.addVolume('60000000000') // $60,000 USDC
    const result = ft.calculateFee('1000000')
    expect(result.rate).toBe(0.008)
  })
})

describe('VariableFloatRevenue', () => {
  it('should give lower rate to high credit agents', () => {
    const vf = new VariableFloatRevenue()
    const lowCredit = vf.calculateFee('1000000', 50, 400)
    const highCredit = vf.calculateFee('1000000', 50, 900)
    expect(Number(highCredit.rate)).toBeLessThan(Number(lowCredit.rate))
  })

  it('should increase rate for high risk', () => {
    const vf = new VariableFloatRevenue()
    const lowRisk = vf.calculateFee('1000000', 10, 700)
    const highRisk = vf.calculateFee('1000000', 90, 700)
    expect(Number(highRisk.rate)).toBeGreaterThan(Number(lowRisk.rate))
  })
})

describe('8004 Identity', () => {
  it('should generate and parse DID', () => {
    const did = generateDID('TABC123', 'tron')
    expect(did).toBe('did:bai:tron:TABC123')
    const parsed = parseDID(did)
    expect(parsed).toEqual({ chain: 'tron', address: 'TABC123' })
  })
})

describe('Credit Score', () => {
  it('should calculate credit score in valid range', () => {
    const score = calculateCreditScore({
      transactionVolume: 100,
      completionRate: 0.95,
      disputeRate: 0.05,
      accountAge: 365 * 24 * 60 * 60 * 1000,
      credentialCount: 5,
    })
    expect(score).toBeGreaterThanOrEqual(300)
    expect(score).toBeLessThanOrEqual(950)
  })

  it('should get credit level', () => {
    expect(getCreditLevel(800)).toBe('excellent')
    expect(getCreditLevel(700)).toBe('good')
    expect(getCreditLevel(550)).toBe('fair')
    expect(getCreditLevel(400)).toBe('poor')
    expect(getCreditLevel(200)).toBe('none')
  })
})

describe('x402 Payment', () => {
  it('should create and validate payment request', () => {
    const req = createPaymentRequest('did:bai:tron:A', 'did:bai:tron:B', 'USDT', '1000000')
    expect(validatePaymentRequest(req).valid).toBe(true)
  })

  it('should reject expired request', () => {
    const req = createPaymentRequest('did:bai:tron:A', 'did:bai:tron:B', 'USDT', '1000000', '', 0)
    const result = validatePaymentRequest(req)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('Payment request expired')
  })

  it('should reject self-payment', () => {
    const req = createPaymentRequest('did:bai:tron:A', 'did:bai:tron:A', 'USDT', '1000000')
    const result = validatePaymentRequest(req)
    expect(result.valid).toBe(false)
  })
})
