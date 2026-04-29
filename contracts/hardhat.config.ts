import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@layerzerolabs/hardhat-deploy'
import '@layerzerolabs/hardhat-tron'

const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000'

const TRON_PRO_API_KEY = process.env.TRON_API_KEY || ''

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{ version: '0.8.20', settings: { optimizer: { enabled: true, runs: 200 } } }],
  },
  tronSolc: {
    enable: true,
    filter: [],
    compilers: [{ version: '0.8.20' }],
  },
  networks: {
    shasta: {
      url: 'https://api.shasta.trongrid.io/jsonrpc',
      accounts: [PRIVATE_KEY],
      chainId: 2494104990,
      httpHeaders: { 'TRON-PRO-API-KEY': TRON_PRO_API_KEY },
      tron: true,
    },
    nile: {
      url: 'https://nile.trongrid.io/jsonrpc',
      accounts: [PRIVATE_KEY],
      chainId: 3448148188,
      httpHeaders: { 'TRON-PRO-API-KEY': TRON_PRO_API_KEY },
      tron: true,
    },
    tron: {
      url: process.env.TRON_MAINNET_RPC || 'https://api.trongrid.io/jsonrpc',
      accounts: [PRIVATE_KEY],
      chainId: 728126428,
      gasPrice: 420_000_000,
      httpHeaders: { 'TRON-PRO-API-KEY': TRON_PRO_API_KEY },
      tron: true,
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
