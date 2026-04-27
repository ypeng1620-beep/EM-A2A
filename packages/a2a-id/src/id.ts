/**
 * A2A ID — Agent 身份注册 + KYA 认证
 *
 * 核心功能：
 *   1. Agent DID 注册 (8004 协议)
 *   2. KYA 认证 (Know Your Agent)
 *   3. 资质 SBT 发行
 *   4. 身份查询 API
 *
 * 变现：注册费 $5-50 + 认证费 $100-1000 + 年审 30%
 */

import {
  ChainFactory,
  generateDID,
  type IChainAdapter,
  type AgentDID,
  type AgentIdentity,
  type SBTCredential,
  type QualificationType,
} from '@em/a2a-core'
import { KYAEngine } from '@em/a2a-compliance'
import type { KYAStatus } from '@em/a2a-compliance'

export interface A2AIDConfig {
  productId: string
  registrationFee: string
  verificationFee: string
  annualReviewFee: string
}

export interface RegisterParams {
  address: string
  name: string
  description?: string
  category: string[]
}

export interface RegisterResult {
  success: boolean
  did?: AgentDID
  identity?: AgentIdentity
  error?: string
}

export interface VerificationResult {
  success: boolean
  status: KYAStatus
  riskScore: number
  error?: string
}

export class A2AID {
  private chain: IChainAdapter
  private kya: KYAEngine
  private config: A2AIDConfig

  constructor(config: A2AIDConfig) {
    this.config = config
    this.chain = ChainFactory.getAdapter('tron:mainnet')
    this.kya = new KYAEngine()
  }

  async connect(): Promise<void> {
    await this.chain.connect()
  }

  async registerAgent(params: RegisterParams): Promise<RegisterResult> {
    try {
      const did = generateDID(params.address, 'tron')

      const { txHash } = await this.chain.registerAgent({
        name: params.name,
        description: params.description ?? '',
        category: params.category,
        address: params.address,
      })

      const identity: AgentIdentity = {
        did,
        address: params.address,
        chain: 'tron',
        registeredAt: Date.now(),
        status: 'active',
        metadata: {
          name: params.name,
          description: params.description,
          category: params.category as AgentIdentity['metadata']['category'],
        },
        credentials: [],
      }

      this.kya.submitForVerification(identity)

      return { success: true, did, identity }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  verifyAgent(did: AgentDID, approved: boolean): VerificationResult {
    try {
      const record = this.kya.verify(did, approved, {})
      return {
        success: approved,
        status: record.status as KYAStatus,
        riskScore: record.riskScore,
      }
    } catch (error) {
      return {
        success: false,
        status: 'rejected',
        riskScore: 100,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async issueCredential(
    did: AgentDID,
    type: QualificationType,
    metadata: Record<string, unknown>,
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    if (!this.kya.isVerified(did)) {
      return { success: false, error: 'Agent not verified' }
    }
    try {
      const result = await this.chain.issueCredential(did, {
        type,
        issuer: 'bai_authority',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        status: 'active',
        metadata,
      })
      return { success: true, credentialId: result.credentialId }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getIdentity(did: AgentDID): Promise<AgentIdentity | null> {
    const identity = await this.chain.resolveDID(did)
    if (!identity) return null

    const record = this.kya.getRecord(did)
    if (record) {
      identity.status = record.status === 'verified' ? 'active' : 'suspended'
    }

    return identity
  }

  async getCredentials(did: AgentDID): Promise<SBTCredential[]> {
    return this.chain.getCredentials(did)
  }

  isVerified(did: AgentDID): boolean {
    return this.kya.isVerified(did)
  }
}
