/**
 * Register products on RevenueSplitter.
 *
 * tronweb cannot encode tuple[] (TierRule[]) — so we:
 *   1. Encode calldata with ethers (handles tuple[] correctly)
 *   2. Hit TronGrid /wallet/triggersmartcontract directly with raw calldata
 *   3. Sign & broadcast with tronweb
 *
 * Usage: PRIVATE_KEY=xxx npx tsx script/register-products.ts [shasta|mainnet]
 */
const TronWeb = require('tronweb').TronWeb
import * as fs from 'fs'
import * as path from 'path'

const NETWORK = process.argv[2] || 'shasta'

const ENDPOINTS: Record<string, string> = {
  shasta: 'https://api.shasta.trongrid.io',
  nile: 'https://nile.trongrid.io',
  mainnet: 'https://api.trongrid.io',
}

const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0000000000000000000000000000000000000000000000000000000000000000'

const FEE_LIMIT = 500_000_000 // 500 TRX

const PRODUCTS = [
  {
    id: 'a2a-pay',
    mode: 1, // FIXED_TIER
    baseRate: 100,
    tiers: [
      { monthlyVolumeUSD: 0, rate: 100 },
      { monthlyVolumeUSD: 10000, rate: 80 },
      { monthlyVolumeUSD: 100000, rate: 50 },
    ],
    minRate: 20,
    maxRate: 500,
  },
  {
    id: 'a2a-market',
    mode: 1,
    baseRate: 100,
    tiers: [
      { monthlyVolumeUSD: 0, rate: 100 },
      { monthlyVolumeUSD: 5000, rate: 75 },
      { monthlyVolumeUSD: 50000, rate: 50 },
    ],
    minRate: 20,
    maxRate: 500,
  },
  {
    id: 'a2a-lend',
    mode: 2, // VARIABLE_FLOAT
    baseRate: 50,
    tiers: [],
    minRate: 10,
    maxRate: 300,
  },
]

async function main() {
  const endpoint = ENDPOINTS[NETWORK]
  if (!endpoint) {
    console.error(`Unknown network: ${NETWORK}`)
    process.exit(1)
  }

  console.log(`Network: ${NETWORK} (${endpoint})`)
  const tw = new TronWeb({ fullHost: endpoint, privateKey: PRIVATE_KEY })
  const fromAddr = tw.address.fromPrivateKey(PRIVATE_KEY)
  const fromHex = tw.address.toHex(fromAddr)
  console.log(`Deployer: ${fromAddr}`)

  const balance = parseFloat(tw.fromSun(await tw.trx.getBalance(fromAddr)))
  console.log(`Balance: ${balance} TRX`)

  // Load RevenueSplitter address
  const deployFile = path.join(__dirname, '..', 'deployments', `${NETWORK}.json`)
  const deployments = JSON.parse(fs.readFileSync(deployFile, 'utf-8'))
  const revenueAddr = deployments.RevenueSplitter?.address
  if (!revenueAddr) {
    console.error('RevenueSplitter not deployed')
    process.exit(1)
  }
  const revenueHex = tw.address.toHex(revenueAddr)
  console.log(`RevenueSplitter: ${revenueAddr} (${revenueHex})`)

  // Load ethers for ABI encoding
  const ethersPath = path.join(
    __dirname,
    '..',
    '..',
    'node_modules',
    '.pnpm',
    'node_modules',
    'ethers',
  )
  const { ethers } = require(ethersPath)

  const artifactPath = path.join(
    __dirname,
    '..',
    'artifacts-tron',
    'src',
    'RevenueSplitter.sol',
    'RevenueSplitter.json',
  )
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'))
  const iface = new ethers.Interface(artifact.abi)

  for (const product of PRODUCTS) {
    const pid = ethers.encodeBytes32String(product.id)
    console.log(`\n=== Registering "${product.id}" ===`)
    console.log(`  pid: ${pid}`)
    console.log(`  mode: ${product.mode === 1 ? 'FIXED_TIER' : 'VARIABLE_FLOAT'}`)
    console.log(`  tiers: ${product.tiers.length} entries`)

    // 1. Encode calldata with ethers (handles tuple[] correctly)
    const calldata = iface.encodeFunctionData('registerProduct', [
      pid,
      product.mode,
      product.baseRate,
      product.tiers,
      product.minRate,
      product.maxRate,
    ])
    console.log(`  calldata: ${calldata.slice(0, 66)}...`)

    // 2. Call TronGrid API directly to create the trigger transaction
    let triggerResult: any
    try {
      const url = `${endpoint}/wallet/triggersmartcontract`
      const body = JSON.stringify({
        owner_address: fromHex,
        contract_address: revenueHex,
        data: calldata,
        fee_limit: FEE_LIMIT,
      })

      console.log(`  POST ${url}`)
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error(`  API error ${resp.status}: ${errText.slice(0, 200)}`)
        continue
      }

      triggerResult = await resp.json()
    } catch (e: any) {
      console.error(`  HTTP request failed: ${e.message}`)
      continue
    }

    // Response has txID at triggerResult.transaction.txID (TronGrid API format)
    const triggerTxId = triggerResult?.transaction?.txID || triggerResult?.txID
    if (!triggerTxId) {
      console.error(`  Trigger failed: ${JSON.stringify(triggerResult).slice(0, 300)}`)
      continue
    }

    console.log(`  Trigger TX ID: ${triggerTxId}`)

    // 3. Sign with tronweb (pass the transaction object)
    const txToSign = triggerResult.transaction || triggerResult
    const signed = await tw.trx.sign(txToSign)
    if (!signed?.txID) {
      console.error('  Signing failed')
      continue
    }

    // 4. Broadcast
    const result = await tw.trx.sendRawTransaction(signed)

    if (!result.result) {
      const msg = result.message
        ? Buffer.from(result.message, 'hex').toString()
        : JSON.stringify(result).slice(0, 200)
      console.error(`  Broadcast failed: ${msg}`)
      continue
    }

    console.log(`  TX: ${result.txid}`)

    // Wait for confirmation
    let info: any = null
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      try {
        info = await tw.trx.getTransactionInfo(result.txid)
        if (info?.id) break
      } catch {}
      process.stdout.write('.')
    }
    console.log('')

    if (!info?.id) {
      console.error('  No confirmation after 30s')
      continue
    }

    const res = info.receipt?.result || info.result
    console.log(
      `  Block: ${info.blockNumber} | Energy: ${info.energy_usage || info.energy_used} | Result: ${res}`,
    )

    if (res === 'SUCCESS') {
      console.log(`  ✓ "${product.id}" registered`)
    } else {
      const reason = info.resMessage
        ? Buffer.from(info.resMessage, 'hex').toString()
        : 'unknown reason'
      console.error(`  ✗ Failed: ${res} — ${reason}`)
    }
  }

  console.log('\n=== Done ===')
}

main().catch(console.error)
