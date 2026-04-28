import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000'

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    shasta: {
      url: 'https://api.shasta.trongrid.io',
      accounts: [PRIVATE_KEY],
      chainId: 1, // Tron mainnet & shasta share chainId in TronBox context
    },
    nile: {
      url: 'https://nile.trongrid.io',
      accounts: [PRIVATE_KEY],
      chainId: 1,
    },
    tron: {
      url: process.env.TRON_MAINNET_RPC || 'https://api.trongrid.io',
      accounts: [PRIVATE_KEY],
      chainId: 728126428, // TRON mainnet chainId
      gasPrice: 420_000_000, // 420 SUN (~0.42 TRX)
    },
  },
  etherscan: {
    apiKey: {
      tron: process.env.TRONSCAN_API_KEY || '',
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
}

export default config
