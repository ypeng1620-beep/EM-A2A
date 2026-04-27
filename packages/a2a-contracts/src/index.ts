/**
 * @em/a2a-contracts — Smart Contract ABIs & Types
 *
 * 提供 4 个核心合约的 ABI、地址管理和类型定义。
 *
 * 合约:
 *   - AgentRegistry       Agent DID 注册与查询
 *   - RevenueSplitter     双模式抽成 (固定级差 / 可变浮动)
 *   - EscrowService       服务托管 (订单→交付→释放)
 *   - MicroPaymentChannel 微支付通道 (链下批处理)
 */

// ---------------------------------------------------------------------------
// Contract addresses
// ---------------------------------------------------------------------------

/** 已知合约部署地址 */
export const CONTRACT_ADDRESSES: Record<string, Record<string, string>> = {
  shasta: {
    AgentRegistry: "",
    RevenueSplitter: "",
    EscrowService: "",
    MicroPaymentChannel: "",
  },
  tron: {
    AgentRegistry: "",
    RevenueSplitter: "",
    EscrowService: "",
    MicroPaymentChannel: "",
  },
}

/** 从环境变量加载合约地址 */
export function loadAddresses(): void {
  const envMap: Record<string, string> = {
    CONTRACT_AGENT_REGISTRY: "AgentRegistry",
    CONTRACT_REVENUE_SPLITTER: "RevenueSplitter",
    CONTRACT_ESCROW_SERVICE: "EscrowService",
    CONTRACT_MICRO_PAYMENT: "MicroPaymentChannel",
  }

  for (const [envKey, contractName] of Object.entries(envMap)) {
    const addr = process.env[envKey]
    if (addr) {
      // Write to both networks as fallback
      CONTRACT_ADDRESSES.shasta[contractName] = addr
      CONTRACT_ADDRESSES.tron[contractName] = addr
    }
  }
}

/** 获取合约地址 */
export function getContractAddress(
  contract: string,
  network: "shasta" | "tron" = "shasta",
): string {
  const addr = CONTRACT_ADDRESSES[network]?.[contract]
  if (!addr) {
    throw new Error(
      `Contract address not configured: ${contract} on ${network}. Set env var or update CONTRACT_ADDRESSES.`,
    )
  }
  return addr
}

// ---------------------------------------------------------------------------
// Contract metadata
// ---------------------------------------------------------------------------

export const CONTRACT_META = {
  AgentRegistry: {
    name: "AgentRegistry",
    description: "Agent DID 注册表 — 链上身份注册、查询、更新、权限管理",
    source: "contracts/src/AgentRegistry.sol",
    version: "0.1.0",
  },
  RevenueSplitter: {
    name: "RevenueSplitter",
    description: "抽成引擎 — 固定级差 + 可变浮动双模式，月度重置，owner 提现",
    source: "contracts/src/RevenueSplitter.sol",
    version: "0.1.0",
  },
  EscrowService: {
    name: "EscrowService",
    description: "托管服务 — 订单生命周期 (created→locked→delivered→completed)，争议处理",
    source: "contracts/src/EscrowService.sol",
    version: "0.1.0",
  },
  MicroPaymentChannel: {
    name: "MicroPaymentChannel",
    description: "微支付通道 — 链下签名批量结算，链上开通/关闭/争议",
    source: "contracts/src/MicroPaymentChannel.sol",
    version: "0.1.0",
  },
} as const

// ---------------------------------------------------------------------------
// Re-export types
// ---------------------------------------------------------------------------

export type ContractName = keyof typeof CONTRACT_META
export type NetworkName = "shasta" | "tron"

/** 部署记录 */
export interface DeploymentRecord {
  network: string
  chainId: number
  deployedAt: string
  deployer: string
  contracts: Record<string, string>
  productIds: { id: string; mode: number; rate: number }[]
}
