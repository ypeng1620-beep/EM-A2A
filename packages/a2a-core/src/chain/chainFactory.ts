/**
 * 链适配器工厂
 *
 * 通过 A2A_NETWORK 环境变量控制目标网络：
 *   shasta → tron:shasta  (测试网)
 *   mainnet → tron:mainnet (主网)
 *   nile → tron:nile       (Nile 测试网)
 */

import { IChainAdapter, type ChainId, type ChainNetwork } from './IChainAdapter.js'
import { TronAdapter, type TronAdapterConfig } from './tronAdapter.js'

function resolveChainId(chainId?: ChainId): ChainId {
  if (chainId) return chainId
  const network: ChainNetwork = (process.env.A2A_NETWORK as ChainNetwork) || 'mainnet'
  const chainType = 'tron'
  return `${chainType}:${network}`
}

function shastaNode(): string {
  return process.env.TRON_FULL_NODE || 'https://api.shasta.trongrid.io'
}

function mainnetNode(): string {
  return process.env.TRON_FULL_NODE || 'https://api.trongrid.io'
}

function getDefaultConfig(network: ChainNetwork): TronAdapterConfig {
  const isTestnet = network === 'shasta' || network === 'nile'
  const node = isTestnet
    ? process.env.TRON_FULL_NODE || 'https://api.shasta.trongrid.io'
    : process.env.TRON_FULL_NODE || 'https://api.trongrid.io'

  return {
    fullNode: node,
    solidityNode: process.env.TRON_SOLIDITY_NODE || node,
    eventServer: process.env.TRON_EVENT_SERVER || node,
    privateKey: process.env.TRON_PRIVATE_KEY,
    contracts: {
      revenueSplitter: process.env.CONTRACT_REVENUE_SPLITTER || '',
      agentRegistry: process.env.CONTRACT_AGENT_REGISTRY || '',
      escrowService: process.env.CONTRACT_ESCROW_SERVICE || '',
      microPaymentChannel: process.env.CONTRACT_MICRO_PAYMENT || '',
    },
  }
}

export class ChainFactory {
  private static adapters = new Map<ChainId, IChainAdapter>()

  static getAdapter(chainId?: ChainId): IChainAdapter {
    const resolved = resolveChainId(chainId)
    const cached = this.adapters.get(resolved)
    if (cached) return cached

    const adapter = this.createAdapter(resolved)
    this.adapters.set(resolved, adapter)
    return adapter
  }

  private static createAdapter(chainId: ChainId): IChainAdapter {
    const [chainType, network] = chainId.split(':') as [string, ChainNetwork]

    switch (chainType) {
      case 'tron': {
        const config = getDefaultConfig(network || 'mainnet')
        return new TronAdapter(chainId, config)
      }
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
