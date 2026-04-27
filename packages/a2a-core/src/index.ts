/**
 * EM-A2A — Shared Core
 *
 * 所有 A2A 产品的共享基础设施：
 * - 类型定义
 * - 链抽象接口 (IChainAdapter)
 * - x402 支付协议
 * - 8004 链上身份协议
 * - 抽成引擎 (双模式)
 */

export * from './types/index.js'
export * from './chain/index.js'
export * from './revenue/index.js'
export * from './protocol/index.js'

export const CORE_VERSION = '0.1.0'
