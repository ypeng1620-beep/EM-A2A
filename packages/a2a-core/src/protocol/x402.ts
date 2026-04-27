/**
 * x402 A2A Payment Protocol
 *
 * 定义 Agent-to-Agent 支付标准流程：
 *   1. 创建支付请求 (PaymentRequest)
 *   2. 签名验证
 *   3. 链上执行
 *   4. 返回收据 (TxReceipt)
 */

import type { AgentDID } from '../types/agent.js'
import type { PaymentRequest, PaymentToken, TxReceipt } from '../types/payment.js'

let nonceCounter = 0

export function createPaymentRequest(
  from: AgentDID,
  to: AgentDID,
  token: PaymentToken,
  amount: string,
  memo?: string,
  expiryMs = 300_000,
): PaymentRequest {
  return {
    id: `pay_${Date.now()}_${++nonceCounter}`,
    from,
    to,
    token,
    amount,
    memo,
    nonce: nonceCounter,
    expiry: Date.now() + expiryMs,
  }
}

export function validatePaymentRequest(req: PaymentRequest): { valid: boolean; reason?: string } {
  if (Date.now() >= req.expiry) {
    return { valid: false, reason: 'Payment request expired' }
  }
  if (BigInt(req.amount) <= 0n) {
    return { valid: false, reason: 'Amount must be positive' }
  }
  if (req.from === req.to) {
    return { valid: false, reason: 'Cannot pay self' }
  }
  return { valid: true }
}

export function buildPaymentPayload(req: PaymentRequest): string {
  return JSON.stringify({
    id: req.id,
    from: req.from,
    to: req.to,
    token: req.token,
    amount: req.amount,
    nonce: req.nonce,
    expiry: req.expiry,
  })
}

export function formatTxReceiptForResponse(receipt: TxReceipt): Record<string, unknown> {
  return {
    txHash: receipt.txHash,
    status: receipt.status,
    amount: receipt.amount,
    fee: receipt.fee,
    timestamp: receipt.timestamp,
  }
}
