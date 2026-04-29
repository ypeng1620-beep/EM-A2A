/**
 * TRON contract deployment script using tronweb directly.
 * Usage: PRIVATE_KEY=xxx npx tsx script/deploy-tronweb.ts [shasta|mainnet]
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

const FEE_LIMIT = 1000_000_000 // 1000 TRX per deploy

interface ContractInfo {
  name: string
  bytecode: string
  abi: any[]
}

function loadArtifact(name: string): ContractInfo {
  const artifactPath = path.join(
    __dirname,
    '..',
    'artifacts-tron',
    'src',
    `${name}.sol`,
    `${name}.json`,
  )
  return JSON.parse(fs.readFileSync(artifactPath, 'utf-8'))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function deployOne(name: string, tw: any) {
  const artifact = loadArtifact(name)
  const kb = Math.round(artifact.bytecode.length / 2 / 1024)
  console.log(`\n=== Deploying ${name} (${kb} KB) ===`)

  const fromAddr = tw.address.fromPrivateKey(PRIVATE_KEY)

  // feeLimit is camelCase - must match tronweb API exactly
  const rawTx = await tw.transactionBuilder.createSmartContract(
    {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      parameter: '',
      name,
      feeLimit: FEE_LIMIT, // camelCase!
      originEnergyLimit: 10_000_000,
    },
    fromAddr,
  )

  console.log(`  fee_limit in tx: ${rawTx.raw_data?.fee_limit / 1_000_000} TRX`)

  const signed = await tw.trx.sign(rawTx)
  const result = await tw.trx.sendRawTransaction(signed)

  if (!result.result) {
    const msg = result.message ? Buffer.from(result.message, 'hex').toString() : 'unknown'
    console.error(`  Failed: ${msg.slice(0, 200)}`)
    return null
  }

  const txId = result.txid
  console.log(`  TX: ${txId}`)

  // Wait for confirmation
  let info: any = null
  for (let i = 0; i < 20; i++) {
    await sleep(3000)
    try {
      info = await tw.trx.getTransactionInfo(txId)
      if (info?.id) break
    } catch {}
    process.stdout.write('.')
  }
  console.log('')

  if (!info?.id) {
    console.error('  No confirmation after 60s')
    return null
  }

  const res = info.receipt?.result || info.result
  console.log(
    `  Block: ${info.blockNumber} | Energy: ${info.energy_usage || info.energy_used} | Result: ${res}`,
  )

  if (res !== 'SUCCESS') {
    console.error(`  Deployment failed: ${res}`)
    return null
  }

  const addr = info.contract_address ? tw.address.fromHex(info.contract_address) : null
  console.log(`  Contract: ${addr}`)
  return { address: addr, txId }
}

async function main() {
  const endpoint = ENDPOINTS[NETWORK]
  if (!endpoint) {
    console.error(`Unknown network: ${NETWORK}`)
    process.exit(1)
  }

  console.log(`Network: ${NETWORK} (${endpoint})`)
  const tw = new TronWeb({ fullHost: endpoint, privateKey: PRIVATE_KEY })
  const fromAddr = tw.address.fromPrivateKey(PRIVATE_KEY)
  console.log(`Deployer: ${fromAddr}`)

  const balance = await tw.trx.getBalance(fromAddr)
  const trxBalance = parseFloat(tw.fromSun(balance))
  console.log(`Balance: ${trxBalance} TRX`)

  if (balance <= 0) {
    console.error('ERROR: 0 balance. Get test TRX from https://www.trongrid.io/shasta')
    console.error(`Address: ${fromAddr}`)
    process.exit(1)
  }

  const contracts = ['AgentRegistry', 'RevenueSplitter', 'EscrowService', 'MicroPaymentChannel']
  const existing: Record<string, any> = {}

  // Load existing deployments to skip
  const deployFile = path.join(__dirname, '..', 'deployments', `${NETWORK}.json`)
  if (fs.existsSync(deployFile)) {
    Object.assign(existing, JSON.parse(fs.readFileSync(deployFile, 'utf-8')))
    console.log('Existing deployments:', Object.keys(existing).join(', '))
  }

  const deployments = { ...existing }

  for (const name of contracts) {
    if (deployments[name]) {
      console.log(`\nSkipping ${name} (already deployed: ${deployments[name].address})`)
      continue
    }
    const r = await deployOne(name, tw)
    if (r) deployments[name] = r
    else {
      console.error(`\nStopped at ${name}`)
      break
    }

    // Check remaining balance
    const bal = parseFloat(tw.fromSun(await tw.trx.getBalance(fromAddr)))
    console.log(`  Remaining balance: ${bal.toFixed(2)} TRX`)
  }

  console.log('\n=== Deployment Summary ===')
  for (const [name, info] of Object.entries(deployments)) {
    console.log(`${name}: ${info.address}`)
  }

  const outDir = path.dirname(deployFile)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(deployFile, JSON.stringify(deployments, null, 2))
  console.log(`\nSaved to ${deployFile}`)
}

main().catch(console.error)
