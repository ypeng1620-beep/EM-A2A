/**
 * A2A Market — Agent 服务市场
 *
 * 核心功能：
 *   1. Agent 上架/注册 (提交 DID + 资质 SBT)
 *   2. 服务发现 (按类别、信用分、价格、评价排序)
 *   3. 服务履约 (托管支付 → 验收 → 释放)
 *   4. 评价系统 (链上不可篡改)
 *
 * 变现：交易抽成 10%-25% + 推荐位 + API 调用费
 */

import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import type {
  AgentDID,
  AgentCategory,
  ServiceListing,
  Order,
  Review,
  ServiceType,
  IChainAdapter,
} from '@em/a2a-core'
import { ChainFactory, RevenueEngine } from '@em/a2a-core'
import { AuditTrail } from '@em/a2a-compliance'

export interface A2AMarketConfig {
  productId: string
  dbPath: string
  commissionRate: number
}

export class A2AMarket {
  private db: Database.Database
  private chain: IChainAdapter
  private revenue: RevenueEngine
  private audit: AuditTrail
  private config: A2AMarketConfig

  constructor(config: A2AMarketConfig) {
    this.config = config
    this.db = new Database(config.dbPath)
    this.chain = ChainFactory.getAdapter('tron:mainnet')
    this.revenue = new RevenueEngine({ mode: 'fixed_tier' })
    this.audit = new AuditTrail()
    this.initDB()
  }

  private initDB(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        price TEXT NOT NULL,
        currency TEXT DEFAULT 'USDC',
        turnaround INTEGER DEFAULT 3600,
        credentials TEXT DEFAULT '[]',
        rating REAL DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        fee TEXT NOT NULL,
        fee_rate REAL NOT NULL,
        status TEXT NOT NULL,
        escrow_tx_hash TEXT,
        release_tx_hash TEXT,
        created_at INTEGER NOT NULL,
        deadline INTEGER NOT NULL,
        requirements TEXT,
        deliverables TEXT
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE,
        reviewer_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT NOT NULL,
        tx_hash TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_listings_agent ON listings(agent_id);
      CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);
      CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
    `)
  }

  async connect(): Promise<void> {
    await this.chain.connect()
  }

  // =========================================================================
  // 服务上架
  // =========================================================================

  createListing(params: {
    agentId: AgentDID
    name: string
    description: string
    category: AgentCategory
    type: ServiceType
    price: string
    currency: 'USDC' | 'USDT'
    turnaround: number
    credentials?: string[]
  }): ServiceListing {
    const id = `listing_${randomUUID()}`
    const now = Date.now()
    const listing: ServiceListing = {
      id,
      agentId: params.agentId,
      name: params.name,
      description: params.description,
      category: params.category,
      type: params.type,
      price: params.price,
      currency: params.currency,
      turnaround: params.turnaround,
      credentials: params.credentials ?? [],
      rating: 0,
      reviewCount: 0,
      successRate: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    }

    const stmt = this.db.prepare(`
      INSERT INTO listings (id, agent_id, name, description, category, type, price, currency, turnaround, credentials, rating, review_count, success_rate, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      listing.id,
      listing.agentId,
      listing.name,
      listing.description,
      listing.category,
      listing.type,
      listing.price,
      listing.currency,
      listing.turnaround,
      JSON.stringify(listing.credentials),
      listing.rating,
      listing.reviewCount,
      listing.successRate,
      listing.active ? 1 : 0,
      listing.createdAt,
      listing.updatedAt,
    )

    this.audit.record('market_listing_created', params.agentId, this.config.productId, {
      listingId: id,
      name: params.name,
      price: params.price,
    })

    return listing
  }

  // =========================================================================
  // 服务发现
  // =========================================================================

  searchListings(options: {
    category?: AgentCategory
    query?: string
    minRating?: number
    maxPrice?: string
    sortBy?: 'rating' | 'price' | 'reviews' | 'created'
    sortOrder?: 'asc' | 'desc'
    limit?: number
    offset?: number
  }): ServiceListing[] {
    let sql = 'SELECT * FROM listings WHERE active = 1'
    const params: unknown[] = []

    if (options.category) {
      sql += ' AND category = ?'
      params.push(options.category)
    }

    if (options.query) {
      sql += ' AND (name LIKE ? OR description LIKE ?)'
      params.push(`%${options.query}%`, `%${options.query}%`)
    }

    if (options.minRating) {
      sql += ' AND rating >= ?'
      params.push(options.minRating)
    }

    const sortBy = options.sortBy ?? 'rating'
    const sortOrder = options.sortOrder ?? 'desc'
    sql += ` ORDER BY ${sortBy} ${sortOrder}`

    const limit = options.limit ?? 50
    const offset = options.offset ?? 0
    sql += ' LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>

    return rows.map(this.rowToListing)
  }

  getAgentListings(agentId: AgentDID): ServiceListing[] {
    const rows = this.db
      .prepare('SELECT * FROM listings WHERE agent_id = ? AND active = 1')
      .all(agentId) as Array<Record<string, unknown>>
    return rows.map(this.rowToListing)
  }

  // =========================================================================
  // 订单管理
  // =========================================================================

  createOrder(
    listingId: string,
    buyerId: AgentDID,
    sellerId: AgentDID,
    amount: string,
    deadline: number,
    requirements?: string,
  ): Order {
    const revenueResult = this.revenue.calculateFee(amount)

    const order: Order = {
      id: `order_${randomUUID()}`,
      listingId,
      buyerId,
      sellerId,
      amount,
      fee: revenueResult.fee,
      feeRate: revenueResult.rate,
      status: 'created',
      createdAt: Date.now(),
      deadline,
      requirements,
    }

    const stmt = this.db.prepare(`
      INSERT INTO orders (id, listing_id, buyer_id, seller_id, amount, fee, fee_rate, status, created_at, deadline, requirements)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      order.id,
      order.listingId,
      order.buyerId,
      order.sellerId,
      order.amount,
      order.fee,
      order.feeRate,
      order.status,
      order.createdAt,
      order.deadline,
      order.requirements,
    )

    this.audit.record('market_order_created', buyerId, this.config.productId, {
      orderId: order.id,
      listingId,
      amount,
      fee: revenueResult.fee,
    })

    return order
  }

  updateOrderStatus(orderId: string, status: Order['status'], txHash?: string): boolean {
    const fields: string[] = ['status = ?']
    const values: unknown[] = [status]

    if (status === 'funded' && txHash) {
      fields.push('escrow_tx_hash = ?')
      values.push(txHash)
    }
    if ((status === 'accepted' || status === 'resolved') && txHash) {
      fields.push('release_tx_hash = ?')
      values.push(txHash)
    }

    values.push(orderId)

    const result = this.db
      .prepare(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values)

    return result.changes > 0
  }

  getOrder(orderId: string): Order | null {
    const row = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      | Record<string, unknown>
      | undefined
    return row ? this.rowToOrder(row) : null
  }

  getAgentOrders(agentId: AgentDID, as: 'buyer' | 'seller' = 'buyer'): Order[] {
    const field = as === 'buyer' ? 'buyer_id' : 'seller_id'
    const rows = this.db
      .prepare(`SELECT * FROM orders WHERE ${field} = ? ORDER BY created_at DESC LIMIT 50`)
      .all(agentId) as Array<Record<string, unknown>>
    return rows.map(this.rowToOrder)
  }

  // =========================================================================
  // 评价系统
  // =========================================================================

  createReview(
    orderId: string,
    reviewerId: AgentDID,
    subjectId: AgentDID,
    rating: number,
    comment: string,
    txHash?: string,
  ): Review {
    // Check order exists and is completed
    const order = this.getOrder(orderId)
    if (!order) throw new Error('Order not found')
    if (order.status !== 'accepted' && order.status !== 'resolved') {
      throw new Error('Order not completed')
    }

    const review: Review = {
      id: `review_${randomUUID()}`,
      orderId,
      reviewerId,
      subjectId,
      rating,
      comment,
      txHash: txHash ?? '',
      createdAt: Date.now(),
    }

    this.db
      .prepare(
        `
      INSERT INTO reviews (id, order_id, reviewer_id, subject_id, rating, comment, tx_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        review.id,
        review.orderId,
        review.reviewerId,
        review.subjectId,
        review.rating,
        review.comment,
        review.txHash,
        review.createdAt,
      )

    // Update listing rating
    const listing = this.db.prepare('SELECT * FROM listings WHERE id = ?').get(order.listingId) as
      | Record<string, unknown>
      | undefined
    if (listing) {
      const currentRating = listing.rating as number
      const currentCount = listing.review_count as number
      const newCount = currentCount + 1
      const newRating = (currentRating * currentCount + rating) / newCount

      this.db
        .prepare('UPDATE listings SET rating = ?, review_count = ? WHERE id = ?')
        .run(newRating, newCount, order.listingId)
    }

    return review
  }

  getAgentReviews(agentId: AgentDID): Review[] {
    const rows = this.db
      .prepare('SELECT * FROM reviews WHERE subject_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(agentId) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string,
      reviewerId: r.reviewer_id as string,
      subjectId: r.subject_id as string,
      rating: r.rating as number,
      comment: r.comment as string,
      txHash: r.tx_hash as string,
      createdAt: r.created_at as number,
    }))
  }

  // =========================================================================
  // 统计
  // =========================================================================

  getStats(): { totalListings: number; totalOrders: number; totalReviews: number } {
    const listings = this.db
      .prepare('SELECT COUNT(*) as count FROM listings WHERE active = 1')
      .get() as { count: number }
    const orders = this.db.prepare('SELECT COUNT(*) as count FROM orders').get() as {
      count: number
    }
    const reviews = this.db.prepare('SELECT COUNT(*) as count FROM reviews').get() as {
      count: number
    }

    return {
      totalListings: listings.count,
      totalOrders: orders.count,
      totalReviews: reviews.count,
    }
  }

  close(): void {
    this.db.close()
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private rowToListing(row: Record<string, unknown>): ServiceListing {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      name: row.name as string,
      description: row.description as string,
      category: row.category as AgentCategory,
      type: row.type as ServiceType,
      price: row.price as string,
      currency: row.currency as 'USDC' | 'USDT',
      turnaround: row.turnaround as number,
      credentials: JSON.parse(row.credentials as string),
      rating: row.rating as number,
      reviewCount: row.review_count as number,
      successRate: row.success_rate as number,
      active: (row.active as number) === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }
  }

  private rowToOrder(row: Record<string, unknown>): Order {
    return {
      id: row.id as string,
      listingId: row.listing_id as string,
      buyerId: row.buyer_id as string,
      sellerId: row.seller_id as string,
      amount: row.amount as string,
      fee: row.fee as string,
      feeRate: row.fee_rate as number,
      status: row.status as Order['status'],
      escrowTxHash: row.escrow_tx_hash as string,
      releaseTxHash: row.release_tx_hash as string,
      createdAt: row.created_at as number,
      deadline: row.deadline as number,
      requirements: row.requirements as string,
      deliverables: row.deliverables as string,
    }
  }
}
