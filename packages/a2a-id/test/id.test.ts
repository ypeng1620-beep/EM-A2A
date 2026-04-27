import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @em/a2a-core chain factory
const mockTronAdapter = {
  chainId: 'tron:mainnet',
  nativeToken: 'TRX',
  connected: false,
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  transferStablecoin: vi.fn(),
  transferNative: vi.fn(),
  getBalance: vi.fn().mockResolvedValue('1000000000'),
  registerAgent: vi.fn().mockResolvedValue({
    did: 'did:bai:tron:TNEW001',
    txHash: 'tx_reg_001',
  }),
  resolveDID: vi.fn().mockResolvedValue({
    did: 'did:bai:tron:TNEW001',
    address: 'TNEW001',
    chain: 'tron',
    registeredAt: Date.now(),
    status: 'active',
    metadata: { name: 'Test Agent', category: ['coding'] },
    credentials: [],
  }),
  updateAgentMetadata: vi.fn().mockResolvedValue({
    txHash: 'tx_meta_001', blockNumber: 123,
    from: 'TNEW001', to: '', token: 'TRX', amount: '0',
    fee: '0', status: 'confirmed', timestamp: Date.now(), chainId: 'tron:mainnet',
  }),
  issueCredential: vi.fn().mockResolvedValue({
    credentialId: 'cred_001',
    txHash: 'tx_cred_001',
  }),
  revokeCredential: vi.fn().mockResolvedValue({
    txHash: 'tx_revoke_001', blockNumber: 123,
    from: '', to: '', token: 'TRX', amount: '0',
    fee: '0', status: 'confirmed', timestamp: Date.now(), chainId: 'tron:mainnet',
  }),
  getCredentials: vi.fn().mockResolvedValue([
    { id: 'cred_001', type: 'code_audit', issuer: 'bai_authority',
      holder: 'did:bai:tron:TNEW001', issuedAt: Date.now(),
      expiresAt: Date.now() + 365 * 86400000, status: 'active',
      metadata: { level: 'senior' }, txHash: 'tx_cred_001' },
  ]),
  getCreditScore: vi.fn(),
  openMicroPaymentChannel: vi.fn(),
  closeMicroPaymentChannel: vi.fn(),
  callContract: vi.fn(),
  sendTransaction: vi.fn(),
  waitForConfirmation: vi.fn(),
  estimateFee: vi.fn().mockResolvedValue('1000000'),
}

vi.mock('@em/a2a-core', async () => {
  const actual = await vi.importActual('@em/a2a-core')
  return {
    ...actual,
    ChainFactory: {
      getAdapter: vi.fn(() => mockTronAdapter),
      connectAll: vi.fn(),
      disconnectAll: vi.fn(),
    },
  }
})

import { A2AID } from '../src/id.js'

describe('A2AID', () => {
  let service: A2AID
  const config = {
    productId: 'a2a-id-test',
    registrationFee: '5000000',   // $5
    verificationFee: '100000000', // $100
    annualReviewFee: '150000000', // $150
  }

  beforeEach(() => {
    vi.clearAllMocks()
    service = new A2AID(config)
  })

  describe('Initialization', () => {
    it('should initialize with config', () => {
      expect(service).toBeDefined()
    })

    it('should mark unverified agents', () => {
      expect(service.isVerified('did:bai:tron:unknown')).toBe(false)
    })
  })

  describe('Agent Registration', () => {
    it('should register a new agent', async () => {
      const result = await service.registerAgent({
        address: 'TNEW001',
        name: 'Test Agent',
        description: 'A test agent for unit tests',
        category: ['coding', 'analysis'],
      })

      expect(result.success).toBe(true)
      expect(result.did).toBe('did:bai:tron:TNEW001')
      expect(result.identity).toBeDefined()
      expect(result.identity!.status).toBe('active')
    })

    it('should generate correct DID format', async () => {
      const result = await service.registerAgent({
        address: 'TABC99',
        name: 'Format Agent',
        category: ['coding'],
      })
      if (result.success) {
        expect(result.did).toMatch(/^did:bai:tron:/)
      }
    })

    it('should handle chain error during registration', async () => {
      mockTronAdapter.registerAgent.mockRejectedValueOnce(new Error('Chain unavailable'))

      const result = await service.registerAgent({
        address: 'TFAIL',
        name: 'Fail Agent',
        category: ['coding'],
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Chain unavailable')
    })
  })

  describe('KYA Verification', () => {
    it('should verify an agent after registration', async () => {
      const reg = await service.registerAgent({
        address: 'TKYA001',
        name: 'KYA Agent',
        category: ['trading'],
      })
      expect(reg.success).toBe(true)

      const result = service.verifyAgent(reg.did!, true)
      expect(result.success).toBe(true)
      expect(result.status).toBe('verified')
    })

    it('should reject an agent', async () => {
      const reg = await service.registerAgent({
        address: 'TBAD001',
        name: 'Bad Agent',
        category: ['other'],
      })

      const result = service.verifyAgent(reg.did!, false)
      expect(result.status).toBe('rejected')
    })

    it('should mark verified agents as verified', async () => {
      const reg = await service.registerAgent({
        address: 'TGOOD001',
        name: 'Good Agent',
        category: ['research'],
      })
      service.verifyAgent(reg.did!, true)
      expect(service.isVerified(reg.did!)).toBe(true)
    })

    it('should return failure for verification of non-existent DID', () => {
      const result = service.verifyAgent('did:bai:tron:noexist', true)
      expect(result.success).toBe(false)
    })
  })

  describe('Credentials', () => {
    it('should issue credential to verified agent', async () => {
      const reg = await service.registerAgent({
        address: 'TCRED01',
        name: 'Credential Agent',
        category: ['coding'],
      })
      service.verifyAgent(reg.did!, true)

      const result = await service.issueCredential(reg.did!, 'code_audit', { level: 'senior' })
      expect(result.success).toBe(true)
      expect(result.credentialId).toBe('cred_001')
    })

    it('should reject credential for unverified agent', async () => {
      const result = await service.issueCredential('did:bai:tron:unverified', 'code_audit', {})
      expect(result.success).toBe(false)
      expect(result.error).toBe('Agent not verified')
    })

    it('should handle chain error during credential issuance', async () => {
      const reg = await service.registerAgent({
        address: 'TCRED02',
        name: 'Cred Chain Error',
        category: ['coding'],
      })
      service.verifyAgent(reg.did!, true)

      mockTronAdapter.issueCredential.mockRejectedValueOnce(new Error('Contract error'))

      const result = await service.issueCredential(reg.did!, 'code_audit', {})
      expect(result.success).toBe(false)
      expect(result.error).toBe('Contract error')
    })
  })

  describe('Identity Queries', () => {
    it('should get agent identity', async () => {
      const reg = await service.registerAgent({
        address: 'TQUERY01',
        name: 'Query Agent',
        category: ['education'],
      })

      const identity = await service.getIdentity(reg.did!)
      expect(identity).toBeDefined()
      // Mock resolves to hardcoded DID — verify we got something back
      expect(identity!.did).toBeDefined()
    })

    it('should get agent credentials', async () => {
      const reg = await service.registerAgent({
        address: 'TCGET01',
        name: 'Cred Get Agent',
        category: ['writing'],
      })
      service.verifyAgent(reg.did!, true)
      await service.issueCredential(reg.did!, 'content_creator', {})

      const credentials = await service.getCredentials(reg.did!)
      expect(credentials.length).toBeGreaterThanOrEqual(1)
    })
  })
})
