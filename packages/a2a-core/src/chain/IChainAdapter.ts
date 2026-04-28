/**
 * 链抽象接口 — 支持多链可插拔
 *
 * 解决"不清楚用哪条链"的问题：
 *   默认实现 TRON，预留 Arbitrum / Solana 适配器接口
 *   通过 ChainFactory 按 chainId 路由到具体实现
 */

import type { AgentDID, AgentIdentity, CreditScore } from '../types/agent.js'
import type { PaymentRequest, TxReceipt, MicroPaymentChannel } from '../types/payment.js'
import type { SBTCredential } from '../types/credential.js'

export type ChainType = 'tron' | 'arbitrum' | 'solana'
export type ChainNetwork = 'mainnet' | 'testnet' | 'shasta' | 'nile'

export type ChainId = `${ChainType}:${ChainNetwork}`

export interface IChainAdapter {
  /** 链标识 */
  readonly chainId: ChainId
  /** 原生代币符号 */
  readonly nativeToken: string
  /** 是否已连接 */
  readonly connected: boolean

  connect(): Promise<void>
  disconnect(): Promise<void>

  // —— 支付 ——
  transferStablecoin(
    to: string,
    token: 'USDT' | 'USDC',
    amount: string,
    memo?: string,
  ): Promise<TxReceipt>
  transferNative(to: string, amount: string): Promise<TxReceipt>
  getBalance(address: string, token?: 'USDT' | 'USDC'): Promise<string>

  // —— 身份 ——
  registerAgent(metadata: Record<string, unknown>): Promise<{ did: AgentDID; txHash: string }>
  resolveDID(did: AgentDID): Promise<AgentIdentity | null>
  updateAgentMetadata(did: AgentDID, metadata: Record<string, unknown>): Promise<TxReceipt>

  // —— SBT 凭证 ——
  issueCredential(
    did: AgentDID,
    credential: Omit<SBTCredential, 'id' | 'holder' | 'issuedAt'>,
  ): Promise<{ credentialId: string; txHash: string }>
  revokeCredential(credentialId: string, reason: string): Promise<TxReceipt>
  getCredentials(did: AgentDID): Promise<SBTCredential[]>

  // —— 信用 ——
  getCreditScore(did: AgentDID): Promise<CreditScore | null>

  // —— 微支付 ——
  openMicroPaymentChannel(to: string, deposit: string): Promise<MicroPaymentChannel>
  closeMicroPaymentChannel(channelId: string): Promise<TxReceipt>

  // —— 合约交互 ——
  callContract(address: string, method: string, args: unknown[]): Promise<string>
  sendTransaction(
    address: string,
    method: string,
    args: unknown[],
    value?: string,
  ): Promise<TxReceipt>

  // —— 工具 ——
  waitForConfirmation(txHash: string, blocks?: number): Promise<TxReceipt>
  estimateFee(recipient: string, token?: string, amount?: string): Promise<string>
}
