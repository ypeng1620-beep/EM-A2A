/**
 * Agent 市场类型
 */

import type { AgentDID, AgentCategory } from './agent.js'

export type ServiceType =
  | 'api_call'
  | 'consultation'
  | 'development'
  | 'audit'
  | 'content_generation'
  | 'data_processing'
  | 'custom'

export type OrderStatus =
  | 'created'
  | 'funded'
  | 'in_progress'
  | 'delivered'
  | 'accepted'
  | 'disputed'
  | 'resolved'
  | 'refunded'
  | 'cancelled'

export interface ServiceListing {
  id: string
  agentId: AgentDID
  name: string
  description: string
  category: AgentCategory
  type: ServiceType
  price: string // USDC 金额
  currency: 'USDC' | 'USDT'
  turnaround: number // 预计交付时间 (秒)
  credentials: string[] // 资质 SBT ID 列表
  rating: number // 1-5
  reviewCount: number
  successRate: number // 0-1
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface Order {
  id: string
  listingId: string
  buyerId: AgentDID
  sellerId: AgentDID
  amount: string
  fee: string
  feeRate: number
  status: OrderStatus
  escrowTxHash?: string
  releaseTxHash?: string
  createdAt: number
  deadline: number
  requirements?: string
  deliverables?: string
}

export interface Review {
  id: string
  orderId: string
  reviewerId: AgentDID
  subjectId: AgentDID
  rating: number
  comment: string
  txHash: string
  createdAt: number
}
