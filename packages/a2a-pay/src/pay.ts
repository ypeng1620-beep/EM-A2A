/**
 * A2A Pay — Agent-to-Agent 支付通道
 *
 * 核心功能：
 *   1. Agent 之间 USDC/USDT 转账
 *   2. 自动抽成计算 (Fixed Tier / Variable Float)
 *   3. 合规检查 (KYA + AML)
 *   4. 审计记录
 */

import {
  ChainFactory,
  RevenueEngine,
  createPaymentRequest,
  validatePaymentRequest,
  type IChainAdapter,
  type TxReceipt,
} from '@em/a2a-core'
import { KYAEngine, AMLScanner, AuditTrail } from '@em/a2a-compliance'
import type { A2APayConfig, TransferParams, TransferResult } from './types.js'

export class A2APay {
  private config: A2APayConfig
  private chain: IChainAdapter
  private revenue: RevenueEngine
  private kya: KYAEngine
  private aml: AMLScanner
  private audit: AuditTrail

  constructor(config: A2APayConfig) {
    this.config = config
    this.chain = ChainFactory.getAdapter('tron:mainnet')
    this.revenue = new RevenueEngine({
      mode: config.revenueMode,
    })
    this.kya = new KYAEngine()
    this.aml = new AMLScanner()
    this.audit = new AuditTrail()
  }

  async connect(): Promise<void> {
    await this.chain.connect()
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    // 1. 验证支付请求
    const request = createPaymentRequest(
      params.from,
      params.to,
      params.token,
      params.amount,
      params.memo,
    )
    const validation = validatePaymentRequest(request)
    if (!validation.valid) {
      return { success: false, fee: '0', feeRate: 0, netAmount: '0', error: validation.reason }
    }

    // 2. 合规检查
    const amlResult = this.aml.scanTransaction(params.from, params.amount, params.to)
    if (amlResult.suspicious) {
      this.audit.record('payment_aml_blocked', params.from, this.config.productId, {
        amount: params.amount,
        to: params.to,
        amlScore: amlResult.score,
        patterns: amlResult.patterns.map((p) => p.name),
        flagged: true,
      })
      return {
        success: false,
        fee: '0',
        feeRate: 0,
        netAmount: '0',
        error: `AML check failed: ${amlResult.patterns.map((p) => p.name).join(', ')}`,
      }
    }

    // 3. 计算抽成
    const revenueResult = this.revenue.calculateFee(params.amount, {
      riskScore: amlResult.score,
      creditScore: 700, // default
      transactionType: params.transactionType,
    })

    const netAmount = this.subtractAmount(params.amount, revenueResult.fee)

    // 4. 链上转账
    let receipt: TxReceipt | undefined
    try {
      receipt = await this.chain.transferStablecoin(params.to, params.token, netAmount, params.memo)
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        fee: revenueResult.fee,
        feeRate: revenueResult.rate,
        netAmount,
        error: errMsg,
      }
    }

    // 5. 记录审计
    this.audit.record(
      'payment_transfer',
      params.from,
      this.config.productId,
      {
        amount: params.amount,
        fee: revenueResult.fee,
        feeRate: revenueResult.rate,
        netAmount,
        to: params.to,
        txHash: receipt.txHash,
        token: params.token,
      },
      receipt.txHash,
      receipt.chainId,
    )

    // 6. 更新 AML 历史
    this.aml.recordTransaction(params.from, params.amount, params.to)
    this.aml.recordTransaction(params.to, params.amount, params.from)

    return {
      success: true,
      receipt,
      fee: revenueResult.fee,
      feeRate: revenueResult.rate,
      netAmount,
    }
  }

  getAuditTrail(): AuditTrail {
    return this.audit
  }

  getConfig(): A2APayConfig {
    return { ...this.config }
  }

  private subtractAmount(total: string, fee: string): string {
    return (BigInt(total) - BigInt(fee)).toString()
  }
}
