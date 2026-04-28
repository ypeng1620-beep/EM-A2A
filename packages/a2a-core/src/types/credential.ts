/**
 * 资质凭证类型 — 8004 SBT (Soul-Bound Token)
 */

export type QualificationType =
  | 'code_audit'
  | 'customer_service'
  | 'investment_advisor'
  | 'legal_advisor'
  | 'risk_controller'
  | 'data_analyst'
  | 'content_creator'
  | 'translator'
  | 'educator'
  | 'custom'

export type CredentialStatus = 'active' | 'expired' | 'revoked'

export interface SBTCredential {
  id: string
  type: QualificationType
  issuer: string // 认证机构 DID
  holder: string // Agent DID
  issuedAt: number
  expiresAt: number
  status: CredentialStatus
  metadata: Record<string, unknown>
  tokenId?: string // 链上 SBT token ID
  txHash?: string
}

export interface CredentialIssuance {
  holder: string
  credential: Omit<SBTCredential, 'id' | 'holder' | 'issuedAt' | 'status'>
}

export interface CredentialRevocation {
  credentialId: string
  reason: string
  revokedAt: number
}
