/**
 * 链适配器工厂
 */

import { IChainAdapter, type ChainId } from './IChainAdapter.js'
import { TronAdapter, type TronAdapterConfig } from './tronAdapter.js'

const DEFAULT_TRON_CONFIG: TronAdapterConfig = {
  fullNode: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
  solidityNode: process.env.TRON_SOLIDITY_NODE || 'https://api.trongrid.io',
  eventServer: process.env.TRON_EVENT_SERVER || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY,
  contracts: {
    revenueSplitter: process.env.CONTRACT_REVENUE_SPLITTER || '',
    agentRegistry: process.env.CONTRACT_AGENT_REGISTRY || '',
    escrowService: process.env.CONTRACT_ESCROW_SERVICE || '',
    microPaymentChannel: process.env.CONTRACT_MICRO_PAYMENT || '',
  },
}

export class ChainFactory {
  private static adapters = new Map<ChainId, IChainAdapter>()

  static getAdapter(chainId: ChainId): IChainAdapter {
    const cached = this.adapters.get(chainId)
    if (cached) return cached

    const adapter = this.createAdapter(chainId)
    this.adapters.set(chainId, adapter)
    return adapter
  }

  private static createAdapter(chainId: ChainId): IChainAdapter {
    const [chainType] = chainId.split(':')

    switch (chainType) {
      case 'tron':
        return new TronAdapter(chainId, DEFAULT_TRON_CONFIG)
      default:
        throw new Error(`Unsupported chain type: ${chainType}`)
    }
  }

  static async connectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.connect()
    }
  }

  static async disconnectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.disconnect()
    }
  }
}
