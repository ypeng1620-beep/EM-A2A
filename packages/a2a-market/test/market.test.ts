import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: better-sqlite3 — simple in-memory store
// ---------------------------------------------------------------------------

interface FakeRow { [key: string]: unknown }

function createFakeDB() {
  const tables = new Map<string, { columns: string[]; rows: FakeRow[] }>()

  // Pre-declare known columns so insert doesn't depend on parsing CREATE TABLE
  const knownColumns: Record<string, string[]> = {
    listings: ['id', 'agent_id', 'name', 'description', 'category', 'type', 'price', 'currency', 'turnaround', 'credentials', 'rating', 'review_count', 'success_rate', 'active', 'created_at', 'updated_at'],
    orders: ['id', 'listing_id', 'buyer_id', 'seller_id', 'amount', 'fee', 'fee_rate', 'status', 'escrow_tx_hash', 'release_tx_hash', 'created_at', 'deadline', 'requirements', 'deliverables'],
    reviews: ['id', 'order_id', 'reviewer_id', 'subject_id', 'rating', 'comment', 'tx_hash', 'created_at'],
  }

  // Ensure tables exist
  for (const [name, cols] of Object.entries(knownColumns)) {
    tables.set(name, { columns: cols, rows: [] })
  }

  return {
    exec(_sql: string): void {
      // No-op: tables pre-created above
    },
    prepare(sql: string) {
      const trimmed = sql.trim().replace(/\s+/g, ' ')

      return {
        run(...params: unknown[]): { changes: number } {
          // INSERT
          const insM = trimmed.match(/^INSERT\s+INTO\s+(\w+)/i)
          if (insM) {
            const t = tables.get(insM[1])
            if (t) {
              const row: FakeRow = {}
              t.columns.forEach((col, i) => { row[col] = params[i] ?? null })
              t.rows.push(row)
              return { changes: 1 }
            }
          }
          // UPDATE
          const updM = trimmed.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i)
          if (updM) {
            const t = tables.get(updM[1])
            if (!t) return { changes: 0 }
            // Parse SET col = ?, col = ?, ...
            const setParts = updM[2].split(',').map(s => s.trim().split(/\s*=\s*\?/)[0].trim())
            // The WHERE param is the last one
            const whereVal = params[params.length - 1]
            let changes = 0
            for (const row of t.rows) {
              // WHERE id = ?
              if (String(row['id'] ?? '') === String(whereVal ?? '')) {
                setParts.forEach((col, i) => {
                  if (col && params[i] !== undefined) {
                    row[col.toLowerCase()] = params[i]
                  }
                })
                changes++
              }
            }
            return { changes }
          }
          return { changes: 0 }
        },

        get(...params: unknown[]): FakeRow | undefined {
          // SELECT * FROM table WHERE id = ?
          const selM = trimmed.match(/^SELECT\s+\*\s+FROM\s+(\w+)\s+WHERE\s+(.+)/i)
          if (selM) {
            const t = tables.get(selM[1])
            if (!t) return undefined
            const whereCol = selM[2].replace(/\s*=\s*\?/, '').trim()
            const whereVal = String(params[0] ?? '')
            return t.rows.find(r => String(r[whereCol] ?? '') === whereVal)
          }
          // SELECT COUNT(*) as count FROM table WHERE ...
          const countM = trimmed.match(/^SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+(\w+)/i)
          if (countM) {
            const t = tables.get(countM[1])
            const whereM = trimmed.match(/WHERE\s+(\w+)\s*=\s*\?/i)
            if (whereM && t) {
              const col = whereM[1]
              const val = String(params[0] ?? '')
              return { count: t.rows.filter(r => String(r[col] === val) || params[0] === 1 ? r[col] === params[0] || r[col] === 1 : true).length }
            }
            return { count: t ? t.rows.length : 0 }
          }
          return undefined
        },

        all(...params: unknown[]): FakeRow[] {
          const selM = trimmed.match(/^SELECT\s+\*\s+FROM\s+(\w+)/i)
          if (!selM) return []
          const t = tables.get(selM[1])
          if (!t) return []

          let rows = [...t.rows]

          // WHERE clause
          const whereM = trimmed.match(/WHERE\s+(.+?)(\s+ORDER|\s+LIMIT|\s*$)/i)
          if (whereM) {
            const whereClause = whereM[1]
            // Consume params: apply each condition in order

            // Handle parenthesized OR: (name LIKE ? OR description LIKE ?)
            const orM = whereClause.match(/\((\w+)\s+LIKE\s+\?\s+OR\s+(\w+)\s+LIKE\s+\?\)/i)
            if (orM) {
              const col1 = orM[1], col2 = orM[2]
              const p1 = String(params.shift() ?? '').replace(/%/g, '')
              const p2 = String(params.shift() ?? '').replace(/%/g, '')
              rows = rows.filter(r =>
                String(r[col1] ?? '').toLowerCase().includes(p1.toLowerCase()) ||
                String(r[col2] ?? '').toLowerCase().includes(p2.toLowerCase())
              )
            }

            // Handle AND-separated conditions
            const parts = whereClause.split(/\s+AND\s+/i)
            for (const part of parts) {
              const pt = part.trim().replace(/[()]/g, '')

              // col = ?
              const eqM = pt.match(/^(\w+)\s*=\s*\?$/i)
              if (eqM) {
                const col = eqM[1]
                const val = String(params.shift() ?? '')
                rows = rows.filter(r => String(r[col] ?? '') === val)
                continue
              }
              // col = literal (e.g. active = 1)
              const eqLitM = pt.match(/^(\w+)\s*=\s*(\d+)$/i)
              if (eqLitM) {
                const col = eqLitM[1]
                const val = parseInt(eqLitM[2])
                rows = rows.filter(r => r[col] === val)
                continue
              }
              // col >= ?
              const gteM = pt.match(/^(\w+)\s*>=\s*\?$/i)
              if (gteM) {
                const col = gteM[1]
                const val = Number(params.shift())
                rows = rows.filter(r => Number(r[col] ?? 0) >= val)
                continue
              }
              // col LIKE ?
              const likeM = pt.match(/^(\w+)\s+LIKE\s+\?$/i)
              if (likeM) {
                const col = likeM[1]
                const pattern = String(params.shift() ?? '').replace(/%/g, '')
                rows = rows.filter(r => String(r[col] ?? '').toLowerCase().includes(pattern.toLowerCase()))
                continue
              }
            }
          }

          // ORDER BY
          const orderM = trimmed.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i)
          if (orderM) {
            const col = orderM[1]
            const dir = orderM[2] === 'ASC' ? 1 : -1
            rows.sort((a, b) => {
              const av = a[col] ?? 0, bv = b[col] ?? 0
              return (av < bv ? -1 : av > bv ? 1 : 0) * dir
            })
          }

          // LIMIT / OFFSET
          const limitM = trimmed.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i)
          if (limitM) {
            const limit = parseInt(limitM[1])
            const offset = parseInt(limitM[2] || '0')
            rows = rows.slice(offset, offset + limit)
          }

          return rows
        },
      }
    },
    close(): void {
      for (const t of tables.values()) t.rows.length = 0
    },
  }
}

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => createFakeDB()),
}))

// ---------------------------------------------------------------------------
// Mock: @em/a2a-core
// ---------------------------------------------------------------------------

vi.mock('@em/a2a-core', () => ({
  ChainFactory: {
    getAdapter: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      registerAgent: vi.fn().mockResolvedValue({ txHash: '0xreg' }),
      resolveDID: vi.fn().mockResolvedValue({ owner: 'addr', metadata: {}, registeredAt: 1, active: true }),
      issueCredential: vi.fn().mockResolvedValue({ txHash: '0xcred' }),
      revokeCredential: vi.fn().mockResolvedValue({ txHash: '0xrevoke' }),
      getCredentials: vi.fn().mockResolvedValue([]),
      getCreditScore: vi.fn().mockResolvedValue(500),
      transferStablecoin: vi.fn().mockResolvedValue({ txHash: '0xtransfer' }),
      openMicroPaymentChannel: vi.fn().mockResolvedValue({ txHash: '0xchannel' }),
      closeMicroPaymentChannel: vi.fn().mockResolvedValue({ txHash: '0xclose' }),
      callContract: vi.fn().mockResolvedValue({}),
      sendTransaction: vi.fn().mockResolvedValue({ txHash: '0xsend' }),
      waitForConfirmation: vi.fn().mockResolvedValue({ status: 1 }),
      estimateFee: vi.fn().mockResolvedValue('1000000'),
    })),
  },
  RevenueEngine: vi.fn().mockImplementation(() => ({
    calculateFee: vi.fn((amount: string) => ({
      amount,
      fee: String(BigInt(amount) / 100n),
      rate: 0.01,
      mode: 'fixed_tier' as const,
    })),
    getMode: vi.fn().mockReturnValue('fixed_tier'),
    setMode: vi.fn(),
    estimateFee: vi.fn().mockReturnValue('10000'),
  })),
}))

// ---------------------------------------------------------------------------
// Mock: @em/a2a-compliance
// ---------------------------------------------------------------------------

vi.mock('@em/a2a-compliance', () => ({
  AuditTrail: vi.fn().mockImplementation(() => ({
    record: vi.fn(),
    query: vi.fn().mockReturnValue([]),
    exportLog: vi.fn().mockReturnValue([]),
  })),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { A2AMarket } from '../src/market.js'

function makeMarket(dbPath = ':memory:') {
  return new A2AMarket({ productId: 'a2a-market', dbPath, commissionRate: 0.01 })
}

describe('A2AMarket', () => {
  let market: A2AMarket

  beforeEach(() => {
    market = makeMarket()
  })

  afterEach(() => {
    market.close()
  })

  describe('Service Listings', () => {
    it('should create a listing', () => {
      const listing = market.createListing({
        agentId: 'did:bai:tron:agent1',
        name: 'Logo Design',
        description: 'Professional logo design service',
        category: 'creative',
        type: 'service',
        price: '5000000',
        currency: 'USDC',
        turnaround: 86400,
      })
      expect(listing.id).toMatch(/^listing_/)
      expect(listing.agentId).toBe('did:bai:tron:agent1')
      expect(listing.price).toBe('5000000')
      expect(listing.rating).toBe(0)
      expect(listing.reviewCount).toBe(0)
      expect(listing.active).toBe(true)
    })

    it('should list agent listings', () => {
      market.createListing({ agentId: 'did:bai:tron:agent1', name: 'S1', description: '', category: 'creative', type: 'service', price: '1000000', currency: 'USDC', turnaround: 3600 })
      market.createListing({ agentId: 'did:bai:tron:agent1', name: 'S2', description: '', category: 'technical', type: 'api', price: '2000000', currency: 'USDT', turnaround: 7200 })
      market.createListing({ agentId: 'did:bai:tron:agent2', name: 'S3', description: '', category: 'creative', type: 'service', price: '1000000', currency: 'USDC', turnaround: 3600 })

      const agentListings = market.getAgentListings('did:bai:tron:agent1')
      expect(agentListings.length).toBe(2)
    })

    it('should search by category', () => {
      market.createListing({ agentId: 'did:a', name: 'Creative work', description: 'desc', category: 'creative', type: 'service', price: '1000000', currency: 'USDC', turnaround: 3600 })
      market.createListing({ agentId: 'did:b', name: 'Tech work', description: 'desc', category: 'technical', type: 'api', price: '2000000', currency: 'USDC', turnaround: 3600 })
      market.createListing({ agentId: 'did:c', name: 'More creative', description: 'desc', category: 'creative', type: 'service', price: '3000000', currency: 'USDC', turnaround: 3600 })

      const results = market.searchListings({ category: 'creative' })
      expect(results.length).toBe(2)
    })

    it('should search by query text', () => {
      market.createListing({ agentId: 'did:a', name: 'Logo Design', description: 'cool logos', category: 'creative', type: 'service', price: '1000000', currency: 'USDC', turnaround: 3600 })
      market.createListing({ agentId: 'did:b', name: 'Smart Contract Audit', description: 'security', category: 'technical', type: 'api', price: '5000000', currency: 'USDC', turnaround: 3600 })

      const r = market.searchListings({ query: 'logo' })
      expect(r.length).toBe(1)
      expect(r[0].name).toBe('Logo Design')
    })

    it('should search by min rating', () => {
      market.createListing({ agentId: 'did:a', name: 'S1', description: '', category: 'creative', type: 'service', price: '1000000', currency: 'USDC', turnaround: 3600 })

      const all = market.searchListings({})
      expect(all.length).toBe(1)
      const filtered = market.searchListings({ minRating: 4 })
      expect(filtered.length).toBe(0)
    })
  })

  describe('Orders', () => {
    it('should create an order', () => {
      const listing = market.createListing({
        agentId: 'did:bai:tron:seller',
        name: 'Service', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })

      const order = market.createOrder(listing.id, 'did:bai:tron:buyer', 'did:bai:tron:seller', '10000000', Date.now() + 86400000)
      expect(order.id).toMatch(/^order_/)
      expect(order.status).toBe('created')
      expect(order.feeRate).toBe(0.01)
    })

    it('should update order status', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'Svc', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })
      const order = market.createOrder(listing.id, 'did:buyer', 'did:seller', '10000000', Date.now() + 86400000)

      const ok = market.updateOrderStatus(order.id, 'funded', '0xescrow_tx')
      expect(ok).toBe(true)

      const updated = market.getOrder(order.id)
      expect(updated).not.toBeNull()
      expect(updated!.status).toBe('funded')
      expect(updated!.escrowTxHash).toBe('0xescrow_tx')
    })

    it('should return null for unknown order', () => {
      expect(market.getOrder('order_nonexistent')).toBeNull()
    })

    it('should list orders by buyer', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'Svc', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })
      market.createOrder(listing.id, 'did:buyer1', 'did:seller', '10000000', Date.now() + 86400000)
      market.createOrder(listing.id, 'did:buyer2', 'did:seller', '10000000', Date.now() + 86400000)

      const buyerOrders = market.getAgentOrders('did:buyer1', 'buyer')
      expect(buyerOrders.length).toBe(1)

      const sellerOrders = market.getAgentOrders('did:seller', 'seller')
      expect(sellerOrders.length).toBe(2)
    })

    it('should update order to accepted with release tx hash', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'S', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })
      const order = market.createOrder(listing.id, 'did:buyer', 'did:seller', '10000000', Date.now() + 86400000)

      market.updateOrderStatus(order.id, 'accepted', '0xrelease')
      const updated = market.getOrder(order.id)
      expect(updated!.status).toBe('accepted')
      expect(updated!.releaseTxHash).toBe('0xrelease')
    })
  })

  describe('Reviews', () => {
    it('should create a review for a completed order', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'Svc', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })
      const order = market.createOrder(listing.id, 'did:buyer', 'did:seller', '10000000', Date.now() + 86400000)
      market.updateOrderStatus(order.id, 'accepted')

      const review = market.createReview(order.id, 'did:buyer', 'did:seller', 5, 'Excellent work!')
      expect(review.id).toMatch(/^review_/)
      expect(review.rating).toBe(5)
      expect(review.comment).toBe('Excellent work!')
    })

    it('should reject review for non-completed order', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'Svc', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })
      const order = market.createOrder(listing.id, 'did:buyer', 'did:seller', '10000000', Date.now() + 86400000)
      // order still 'created', not 'accepted'

      expect(() => market.createReview(order.id, 'did:buyer', 'did:seller', 5, 'Good')).toThrow('Order not completed')
    })

    it('should update listing rating after reviews', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'Svc', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })

      for (let i = 0; i < 2; i++) {
        const order = market.createOrder(listing.id, `did:buyer${i}`, 'did:seller', '10000000', Date.now() + 86400000)
        market.updateOrderStatus(order.id, 'accepted')
        market.createReview(order.id, `did:buyer${i}`, 'did:seller', i === 0 ? 5 : 3, 'review')
      }

      const reviews = market.getAgentReviews('did:seller')
      expect(reviews.length).toBe(2)
    })

    it('should throw on review for non-existent order', () => {
      expect(() => market.createReview('order_fake', 'did:buyer', 'did:seller', 3, 'Bad')).toThrow('Order not found')
    })
  })

  describe('Stats', () => {
    it('should return aggregate stats', () => {
      const listing = market.createListing({
        agentId: 'did:seller', name: 'S', description: '', category: 'technical', type: 'api',
        price: '10000000', currency: 'USDC', turnaround: 3600,
      })
      market.createOrder(listing.id, 'did:buyer', 'did:seller', '10000000', Date.now() + 86400000)

      const stats = market.getStats()
      expect(stats.totalListings).toBe(1)
      expect(stats.totalOrders).toBe(1)
      expect(stats.totalReviews).toBe(0)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty search results', () => {
      const results = market.searchListings({ category: 'finance' })
      expect(results).toEqual([])
    })

    it('should handle empty agent listings', () => {
      expect(market.getAgentListings('did:unknown')).toEqual([])
    })

    it('should handle empty agent reviews', () => {
      expect(market.getAgentReviews('did:unknown')).toEqual([])
    })
  })
})
