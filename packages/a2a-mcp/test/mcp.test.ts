import { describe, it, expect, beforeEach } from 'vitest'
import { paySchema, handlePay } from '../src/tools/pay.js'
import { escrowSchema, handleEscrow } from '../src/tools/escrow.js'
import { revenueSchema, handleRevenue } from '../src/tools/revenue.js'
import { creditSchema, handleCredit } from '../src/tools/credit.js'
import { createServer } from '../src/server.js'
import { resetState } from '../src/state.js'

beforeEach(() => resetState())

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('paySchema', () => {
  it('should accept valid pay args', () => {
    const r = paySchema.safeParse({ from: 'did:tron:0xA', to: 'did:tron:0xB', amount: '1000000' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.token).toBe('USDC')
      expect(r.data.memo).toBeUndefined()
    }
  })

  it('should accept optional memo', () => {
    const r = paySchema.safeParse({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      memo: 'for coffee',
    })
    expect(r.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const r = paySchema.safeParse({ from: 'did:tron:0xA' })
    expect(r.success).toBe(false)
  })
})

describe('escrowSchema', () => {
  it('should accept lock action', () => {
    const r = escrowSchema.safeParse({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '1000000',
      action: 'lock',
      task: 'Build UI',
    })
    expect(r.success).toBe(true)
  })

  it('should accept release with escrowId', () => {
    const r = escrowSchema.safeParse({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '1000000',
      action: 'release',
      escrowId: 'esc_abc123',
    })
    expect(r.success).toBe(true)
  })

  it('should reject invalid action', () => {
    const r = escrowSchema.safeParse({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '1000000',
      action: 'invalid',
    })
    expect(r.success).toBe(false)
  })
})

describe('revenueSchema', () => {
  it('should accept fixed_tier mode', () => {
    const r = revenueSchema.safeParse({ amount: '1000000', mode: 'fixed_tier' })
    expect(r.success).toBe(true)
  })

  it('should accept variable_float with risk and credit scores', () => {
    const r = revenueSchema.safeParse({
      amount: '1000000',
      mode: 'variable_float',
      riskScore: 30,
      creditScore: 750,
    })
    expect(r.success).toBe(true)
  })

  it('should default mode to fixed_tier', () => {
    const r = revenueSchema.safeParse({ amount: '1000000' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.mode).toBe('fixed_tier')
  })
})

describe('creditSchema', () => {
  it('should accept valid agentId', () => {
    const r = creditSchema.safeParse({ agentId: 'did:tron:0xA' })
    expect(r.success).toBe(true)
  })

  it('should reject missing agentId', () => {
    const r = creditSchema.safeParse({})
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Revenue tool (no network needed)
// ---------------------------------------------------------------------------

describe('handleRevenue', () => {
  it('should calculate fixed_tier fee', async () => {
    const result = await handleRevenue({ amount: '1000000', mode: 'fixed_tier' })
    expect('content' in result).toBe(true)
  })

  it('should calculate variable_float fee', async () => {
    const result = await handleRevenue({
      amount: '2000000',
      mode: 'variable_float',
      riskScore: 20,
      creditScore: 780,
    })
    expect('content' in result).toBe(true)
  })

  it('should include comparison in result', async () => {
    const result = await handleRevenue({ amount: '1000000', mode: 'fixed_tier' })
    const text = (result as any).content[0].text
    const data = JSON.parse(text)
    expect(data.mode).toBe('fixed_tier')
    expect(data.comparison).toBeDefined()
    expect(data.comparison.mode).toBe('variable_float')
  })
})

// ---------------------------------------------------------------------------
// Escrow tool (in-memory state)
// ---------------------------------------------------------------------------

describe('handleEscrow', () => {
  it('should lock funds', async () => {
    const result = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'lock',
      task: 'Code review',
    })
    const text = (result as any).content[0].text
    const data = JSON.parse(text)
    expect(data.action).toBe('lock')
    expect(data.status).toBe('locked')
    expect(data.escrowId).toMatch(/^esc_/)
  })

  it('should release locked funds', async () => {
    const lock = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'lock',
      task: 'Code review',
    })
    const lockData = JSON.parse((lock as any).content[0].text)
    const result = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'release',
      escrowId: lockData.escrowId,
    })
    const data = JSON.parse((result as any).content[0].text)
    expect(data.action).toBe('release')
    expect(data.status).toBe('released')
  })

  it('should refund locked funds', async () => {
    const lock = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'lock',
      task: 'Code review',
    })
    const lockData = JSON.parse((lock as any).content[0].text)
    const result = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'refund',
      escrowId: lockData.escrowId,
    })
    const data = JSON.parse((result as any).content[0].text)
    expect(data.action).toBe('refund')
    expect(data.status).toBe('refunded')
  })

  it('should error on release without escrowId', async () => {
    const result = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'release',
    })
    expect((result as any).isError).toBe(true)
  })

  it('should error on unknown escrowId', async () => {
    const result = await handleEscrow({
      from: 'did:tron:0xA',
      to: 'did:tron:0xB',
      amount: '5000000',
      action: 'release',
      escrowId: 'esc_nonexistent',
    })
    expect((result as any).isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Credit tool (in-memory state)
// ---------------------------------------------------------------------------

describe('handleCredit', () => {
  it('should return credit score for an agent', async () => {
    const result = await handleCredit({ agentId: 'did:tron:0xC' })
    const text = (result as any).content[0].text
    const data = JSON.parse(text)
    expect(data.agentId).toBe('did:tron:0xC')
    expect(data.score).toBeDefined()
    expect(data.level).toBeDefined()
    expect(data.leaderboard).toBeInstanceOf(Array)
  })
})

// ---------------------------------------------------------------------------
// Server construction
// ---------------------------------------------------------------------------

describe('createServer', () => {
  it('should create MCP server without errors', () => {
    const server = createServer()
    expect(server).toBeDefined()
  })
})
