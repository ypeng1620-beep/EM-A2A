/**
 * TRON Chain Adapter
 *
 * Default implementation for TRON network via TronWeb.
 * Contract addresses configured via environment variables.
 */

import { IChainAdapter, type ChainId } from './IChainAdapter.js'
import type { AgentDID, AgentIdentity, CreditScore, CreditLevel } from '../types/agent.js'
import type { TxReceipt, MicroPaymentChannel, PaymentStatus } from '../types/payment.js'
import type { SBTCredential } from '../types/credential.js'

export interface TronAdapterConfig {
  fullNode: string
  solidityNode: string
  eventServer: string
  privateKey?: string
  contracts: {
    revenueSplitter: string
    agentRegistry: string
    escrowService: string
    microPaymentChannel: string
  }
}

// Retry config
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

export class TronAdapter implements IChainAdapter {
  readonly chainId: ChainId
  readonly nativeToken = 'TRX'
  connected = false

  private config: TronAdapterConfig
  private tronWeb: any = null

  constructor(chainId: ChainId, config: TronAdapterConfig) {
    this.chainId = chainId
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      const { TronWeb } = await import('tronweb')
      this.tronWeb = new TronWeb({
        fullHost: this.config.fullNode,
        solidityNode: this.config.solidityNode,
        eventServer: this.config.eventServer,
        privateKey: this.config.privateKey,
      })
      this.connected = true
    } catch {
      console.warn('[TronAdapter] tronweb not available, using mock mode')
      this.connected = true
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  // =========================================================================
  // Payment
  // =========================================================================

  async transferStablecoin(
    to: string,
    token: 'USDT' | 'USDC',
    amount: string,
    memo?: string,
  ): Promise<TxReceipt> {
    this.ensureConnected()

    const contractAddress =
      token === 'USDT' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'

    return this.withRetry(async () => {
      const tx = await this.tronWeb.transactionBuilder.triggerSmartContract(
        this.tronWeb.address.toHex(contractAddress),
        'transfer(address,uint256)',
        {},
        [
          { type: 'address', value: to },
          { type: 'uint256', value: amount },
        ],
        this.tronWeb.address.toHex(this.config.privateKey),
      )

      const signedTx = await this.tronWeb.trx.sign(tx.transaction)
      const result = await this.tronWeb.trx.sendRawTransaction(signedTx)

      return {
        txHash: result.txid,
        blockNumber: result.blockNumber ?? 0,
        from: this.tronWeb.defaultAddress.base58,
        to,
        token,
        amount,
        fee: '0',
        status: 'pending' as PaymentStatus,
        timestamp: Date.now(),
        chainId: this.chainId,
      }
    })
  }

  async transferNative(to: string, amount: string): Promise<TxReceipt> {
    this.ensureConnected()

    return this.withRetry(async () => {
      const tx = await this.tronWeb.transactionBuilder.sendTrx(to, amount)
      const signedTx = await this.tronWeb.trx.sign(tx)
      const result = await this.tronWeb.trx.sendRawTransaction(signedTx)

      return {
        txHash: result.txid,
        blockNumber: result.blockNumber ?? 0,
        from: this.tronWeb.defaultAddress.base58,
        to,
        token: 'TRX',
        amount,
        fee: '0',
        status: 'pending' as PaymentStatus,
        timestamp: Date.now(),
        chainId: this.chainId,
      }
    })
  }

  async getBalance(address: string, token?: 'USDT' | 'USDC'): Promise<string> {
    this.ensureConnected()

    if (token) {
      const contractAddress =
        token === 'USDT'
          ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
          : 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'
      const contract = await this.tronWeb.contract().at(contractAddress)
      const balance = await contract.balanceOf(address).call()
      return balance.toString()
    }
    const balance = await this.tronWeb.trx.getBalance(address)
    return balance.toString()
  }

  // =========================================================================
  // Identity
  // =========================================================================

  async registerAgent(
    metadata: Record<string, unknown>,
  ): Promise<{ did: AgentDID; txHash: string }> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.agentRegistry)

    const address = this.tronWeb.defaultAddress.base58
    const did = `did:bai:tron:${address}`

    return this.withRetry(async () => {
      const contract = await this.tronWeb.contract().at(this.config.contracts.agentRegistry)
      const result = await contract
        .registerAgent(did, JSON.stringify(metadata))
        .send({ feeLimit: 100_000_000 })

      return { did, txHash: result }
    })
  }

  async resolveDID(did: string): Promise<AgentIdentity | null> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.agentRegistry)

    const contract = await this.tronWeb.contract().at(this.config.contracts.agentRegistry)
    const result = await contract.resolveDID(did).call()

    // Contract returns tuple: [owner, metadata, registeredAt, active]
    // In TronWeb, call() returns the raw values
    if (!result || !result.owner) return null

    const active =
      result.active === true || result.active === 'true' || result.active?.toString() === '1'
    const registeredAt =
      typeof result.registeredAt === 'bigint'
        ? Number(result.registeredAt) * 1000
        : Number(result.registeredAt) * 1000

    let metadata = {}
    try {
      metadata = typeof result.metadata === 'string' ? JSON.parse(result.metadata) : {}
    } catch {
      metadata = { raw: result.metadata }
    }

    return {
      did,
      address: result.owner,
      chain: 'tron',
      registeredAt: registeredAt || Date.now(),
      status: active ? 'active' : 'suspended',
      metadata: {
        name: (metadata as any).name ?? '',
        description: (metadata as any).description,
        category: (metadata as any).category ?? [],
      },
      credentials: [],
    }
  }

  async updateAgentMetadata(did: string, metadata: Record<string, unknown>): Promise<TxReceipt> {
    this.ensureConnected()

    const contract = await this.tronWeb.contract().at(this.config.contracts.agentRegistry)
    const result = await contract.updateMetadata(did, JSON.stringify(metadata)).send()

    return {
      txHash: result,
      blockNumber: 0,
      from: '',
      to: '',
      token: 'TRX',
      amount: '0',
      fee: '0',
      status: 'confirmed',
      timestamp: Date.now(),
      chainId: this.chainId,
    }
  }

  // =========================================================================
  // Credentials
  // =========================================================================

  async issueCredential(
    did: string,
    credential: Omit<SBTCredential, 'id' | 'holder' | 'issuedAt'>,
  ): Promise<{ credentialId: string; txHash: string }> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.agentRegistry)

    const credentialId = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    return this.withRetry(async () => {
      const contract = await this.tronWeb.contract().at(this.config.contracts.agentRegistry)
      const result = await contract
        .issueCredential(
          credentialId,
          did,
          credential.type,
          JSON.stringify(credential.metadata ?? {}),
          Math.floor(credential.expiresAt / 1000),
        )
        .send({ feeLimit: 100_000_000 })

      return { credentialId, txHash: result }
    })
  }

  async revokeCredential(credentialId: string, _reason: string): Promise<TxReceipt> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.agentRegistry)

    const contract = await this.tronWeb.contract().at(this.config.contracts.agentRegistry)
    const result = await contract.revokeCredential(credentialId).send({ feeLimit: 100_000_000 })

    return {
      txHash: result,
      blockNumber: 0,
      from: this.tronWeb.defaultAddress.base58,
      to: '',
      token: 'TRX',
      amount: '0',
      fee: '0',
      status: 'confirmed',
      timestamp: Date.now(),
      chainId: this.chainId,
    }
  }

  async getCredentials(did: string): Promise<SBTCredential[]> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.agentRegistry)

    // AgentRegistry stores credentials by credentialId, not by DID.
    // We iterate over known credential IDs via events or local cache.
    // For now, return empty — requires event indexing to implement fully.
    return []
  }

  // =========================================================================
  // Credit
  // =========================================================================

  async getCreditScore(did: string): Promise<CreditScore | null> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.revenueSplitter)

    try {
      const agentIdBytes = this.didToBytes32(did)
      const contract = await this.tronWeb.contract().at(this.config.contracts.revenueSplitter)
      const score = await contract.agentCreditScores(agentIdBytes).call()

      if (!score || score === '0') return null

      const scoreNum = Number(score)
      let level: CreditLevel = 'none'
      if (scoreNum >= 750) level = 'excellent'
      else if (scoreNum >= 650) level = 'good'
      else if (scoreNum >= 500) level = 'fair'
      else if (scoreNum >= 350) level = 'poor'

      return {
        did,
        score: scoreNum,
        level,
        updatedAt: Date.now(),
        factors: {
          transactionVolume: 0,
          completionRate: 0,
          disputeRate: 0,
          accountAge: 0,
          credentialCount: 0,
        },
        history: [],
      }
    } catch {
      return null
    }
  }

  // =========================================================================
  // Micro Payment Channel
  // =========================================================================

  async openMicroPaymentChannel(to: string, deposit: string): Promise<MicroPaymentChannel> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.microPaymentChannel)

    const channelId = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const channelIdBytes = this.stringToBytes32(channelId)
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600 // 30 days

    return this.withRetry(async () => {
      const contract = await this.tronWeb.contract().at(this.config.contracts.microPaymentChannel)
      await contract
        .openChannel(channelIdBytes, to, expiresAt)
        .send({ callValue: deposit, feeLimit: 100_000_000 })

      return {
        channelId,
        from: `did:bai:tron:${this.tronWeb.defaultAddress.base58}`,
        to: `did:bai:tron:${to}`,
        deposit,
        balance: '0',
        nonce: 0,
        openedAt: Date.now(),
        expiresAt: expiresAt * 1000,
        status: 'open',
      }
    })
  }

  async closeMicroPaymentChannel(channelId: string): Promise<TxReceipt> {
    this.ensureConnected()
    this.requireContract(this.config.contracts.microPaymentChannel)

    const channel = await this.getChannelState(channelId)
    if (!channel) throw new Error(`Channel ${channelId} not found`)

    // Build signature: keccak256(abi.encodePacked(channelId, paid, nonce))
    const message = this.tronWeb.utils.keccak256(
      this.tronWeb.utils.toHex(channelId) +
        this.tronWeb.utils.toHex(channel.balance).slice(2) +
        this.tronWeb.utils.toHex(channel.nonce).slice(2),
    )

    const signed = await this.tronWeb.trx.signMessage(message)

    const contract = await this.tronWeb.contract().at(this.config.contracts.microPaymentChannel)
    const result = await contract
      .closeChannel(this.stringToBytes32(channelId), channel.balance, signed)
      .send({ feeLimit: 100_000_000 })

    return {
      txHash: result,
      blockNumber: 0,
      from: this.tronWeb.defaultAddress.base58,
      to: '',
      token: 'TRX',
      amount: '0',
      fee: '0',
      status: 'confirmed',
      timestamp: Date.now(),
      chainId: this.chainId,
    }
  }

  // =========================================================================
  // Generic Contract
  // =========================================================================

  async callContract(address: string, method: string, args: unknown[]): Promise<string> {
    this.ensureConnected()

    const contract = await this.tronWeb.contract().at(address)
    const result = await contract[method](...args).call()
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  async sendTransaction(
    address: string,
    method: string,
    args: unknown[],
    value?: string,
  ): Promise<TxReceipt> {
    this.ensureConnected()

    return this.withRetry(async () => {
      const contract = await this.tronWeb.contract().at(address)
      const options: Record<string, unknown> = { feeLimit: 100_000_000 }
      if (value) options.callValue = value

      const result = await contract[method](...args).send(options)

      return {
        txHash: result,
        blockNumber: 0,
        from: this.tronWeb.defaultAddress.base58,
        to: address,
        token: 'TRX',
        amount: value ?? '0',
        fee: '0',
        status: 'pending',
        timestamp: Date.now(),
        chainId: this.chainId,
      }
    })
  }

  // =========================================================================
  // Utility
  // =========================================================================

  async waitForConfirmation(txHash: string, blocks = 3): Promise<TxReceipt> {
    this.ensureConnected()

    // Poll until transaction is confirmed
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      try {
        const txInfo = await this.tronWeb.trx.getTransaction(txHash)
        if (txInfo && txInfo.blockNumber) {
          return {
            txHash,
            blockNumber: txInfo.blockNumber,
            from: '',
            to: '',
            token: 'TRX',
            amount: '0',
            fee: '0',
            status: 'confirmed',
            timestamp: txInfo.blockTimeStamp ? txInfo.blockTimeStamp * 1000 : Date.now(),
            chainId: this.chainId,
          }
        }
      } catch {
        // Transaction not yet confirmed, continue polling
      }

      if (attempt >= blocks * 2) break
    }

    return {
      txHash,
      blockNumber: 0,
      from: '',
      to: '',
      token: 'TRX',
      amount: '0',
      fee: '0',
      status: 'pending',
      timestamp: Date.now(),
      chainId: this.chainId,
    }
  }

  async estimateFee(_recipient: string, token?: string, _amount?: string): Promise<string> {
    this.ensureConnected()

    try {
      // Get energy price from chain
      const chainParams = await this.tronWeb.trx.getChainParameters()
      const energyFee = chainParams?.find((p: any) => p.key === 'getEnergyFee')?.value ?? 420
      // Base TRX for bandwidth + energy
      return (energyFee * 200).toString()
    } catch {
      // Default TRX fee for simple transfer
      return token ? '2000000' : '1000000'
    }
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private ensureConnected(): void {
    if (!this.connected || !this.tronWeb) {
      throw new Error('[TronAdapter] Not connected. Call connect() first.')
    }
  }

  private requireContract(address: string): void {
    if (!address) {
      throw new Error('[TronAdapter] Contract address not configured.')
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)))
        }
      }
    }
    throw lastError
  }

  private async getChannelState(channelId: string): Promise<any> {
    const contract = await this.tronWeb.contract().at(this.config.contracts.microPaymentChannel)
    return contract.getChannel(this.stringToBytes32(channelId)).call()
  }

  private stringToBytes32(str: string): string {
    // Pad or truncate to 32 bytes
    let hex = Buffer.from(str, 'utf8').toString('hex')
    if (hex.length > 64) hex = hex.slice(0, 64)
    else hex = hex.padEnd(64, '0')
    return '0x' + hex
  }

  private didToBytes32(did: string): string {
    return this.stringToBytes32(did)
  }
}
