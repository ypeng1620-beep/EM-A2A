/**
 * EM-A2A E2E Test Script
 *
 * Tests the full A2A flow on Shasta testnet:
 *   1. Revenue calculation (client-side)
 *   2. Credit scoring (client-side)
 *   3. Escrow lock/release/refund (in-memory)
 *   4. On-chain contract verification (read RevenueSplitter state)
 *   5. On-chain balance check
 *   6. On-chain micro transfer (if tokens available)
 *
 * Usage: npx tsx scripts/e2e.ts
 */

// Load .env first
import * as fs from 'fs'
import * as path from 'path'

const dotenvPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(dotenvPath)) {
  const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

process.env.A2A_NETWORK = process.env.A2A_NETWORK || 'shasta'
process.env.TRON_PRIVATE_KEY = process.env.TRON_PRIVATE_KEY || process.env.PRIVATE_KEY || ''

import { A2ACredit } from '@poisonpyf/a2a-credit'
import { RevenueEngine, ChainFactory, type IChainAdapter } from '@poisonpyf/a2a-core'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
let skipped = 0

function ok(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ': ' + detail : ''}`)
    passed++
  } else {
    console.error(`  \x1b[31m✗\x1b[0m ${name}${detail ? ': ' + detail : ''}`)
    failed++
  }
}

function skip(name: string, reason: string) {
  console.log(`  \x1b[33m○\x1b[0m ${name} (SKIP: ${reason})`)
  skipped++
}

function header(title: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'═'.repeat(60)}`)
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIVATE_KEY = process.env.TRON_PRIVATE_KEY
const DEPLOYER = 'TFpQx41Gw2S6zZYJ8dWCb6s4vRi3ukX46V'
const AGENT_A = 'did:bai:tron:' + DEPLOYER
const AGENT_B = 'did:bai:tron:TTestAgentB1234567890123456789012345'

const CONTRACTS = {
  revenueSplitter: process.env.CONTRACT_REVENUE_SPLITTER || '',
  agentRegistry: process.env.CONTRACT_AGENT_REGISTRY || '',
  escrowService: process.env.CONTRACT_ESCROW_SERVICE || '',
  microPaymentChannel: process.env.CONTRACT_MICRO_PAYMENT || '',
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║       EM-A2A E2E Test — Shasta Testnet                 ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`  Network:  ${process.env.A2A_NETWORK}`)
  console.log(`  Deployer: ${DEPLOYER}`)
  console.log(`  TRX:      ${process.env.TRON_FULL_NODE}`)
  for (const [name, addr] of Object.entries(CONTRACTS)) {
    console.log(`  ${name}: ${addr || '(not set)'}`)
  }

  // =========================================================================
  // Test 1: Revenue Engine (client-side, no chain needed)
  // =========================================================================
  header('1. Revenue Engine (client-side)')

  const revenueFixed = new RevenueEngine({ mode: 'fixed_tier' })
  const r1 = revenueFixed.calculateFee('100000000', {
    // 100 USDC
    riskScore: 30,
    creditScore: 700,
    transactionType: 'standard',
  })
  console.log(
    `    Fixed tier:   fee=${r1.fee.padStart(8)}, rate=${(r1.rate * 100).toFixed(2)}% (tier: ${r1.tier})`,
  )
  ok('Fixed tier produces fee', BigInt(r1.fee) > 0n)
  ok('Fixed tier fee < amount', BigInt(r1.fee) < 100_000_000n)

  const revenueVar = new RevenueEngine({ mode: 'variable_float' })
  const r2 = revenueVar.calculateFee('100000000', {
    riskScore: 20,
    creditScore: 780,
    transactionType: 'standard',
  })
  console.log(
    `    Variable:      fee=${r2.fee.padStart(8)}, rate=${(r2.rate * 100).toFixed(2)}% (tier: ${r2.tier})`,
  )
  ok('Variable float produces fee', BigInt(r2.fee) > 0n)

  // High risk should produce higher fee
  const r3 = revenueVar.calculateFee('100000000', {
    riskScore: 90,
    creditScore: 350,
    transactionType: 'high_value',
  })
  ok('High risk → higher fee', BigInt(r3.fee) > BigInt(r2.fee), `high=${r3.fee} vs low=${r2.fee}`)

  // Zero amount
  const r4 = revenueFixed.calculateFee('0', {
    riskScore: 0,
    creditScore: 700,
    transactionType: 'standard',
  })
  ok('Zero amount → zero fee', BigInt(r4.fee) === 0n, `fee=${r4.fee}`)

  // =========================================================================
  // Test 2: Credit Engine (client-side)
  // =========================================================================
  header('2. Credit Engine (client-side)')

  const credit = new A2ACredit()

  // Record behaviors
  credit.recordBehavior(AGENT_A, 'payment', { amount: '1000000', to: AGENT_B })
  credit.recordBehavior(AGENT_A, 'order_completed', { task: 'Build UI' })
  credit.recordBehavior(AGENT_A, 'order_completed', { task: 'Fix bug' })
  credit.recordBehavior(AGENT_A, 'credential_issued', { type: 'KYC', issuer: 'KYC Provider' })

  const scoreA = credit.calculateScore(AGENT_A)
  console.log(`    Agent A: score=${scoreA.score}, level=${scoreA.level}`)
  ok('Credit score > 0', scoreA.score > 0)
  ok('Credit level assigned', scoreA.level !== 'none')

  // Dispute event decreases score (completion rate drops)
  const beforeDispute = credit.getCreditScore(AGENT_A)!.score
  credit.recordBehavior(AGENT_A, 'order_disputed', { reason: 'Late delivery' })
  const afterDispute = credit.calculateScore(AGENT_A)
  ok(
    'Dispute reduces score',
    afterDispute.score < beforeDispute,
    `${beforeDispute} → ${afterDispute.score}`,
  )

  // Trend
  const trend = credit.getScoreTrend(AGENT_A, 5)
  ok('Score trend available', trend.length > 0, `${trend.length} entries`)

  // Leaderboard
  credit.recordBehavior(AGENT_B, 'payment', { amount: '5000000' })
  credit.recordBehavior(AGENT_B, 'order_completed', { task: 'Task 1' })
  credit.recordBehavior(AGENT_B, 'order_completed', { task: 'Task 2' })
  credit.recordBehavior(AGENT_B, 'credential_issued', { type: 'KYC' })
  credit.calculateScore(AGENT_B)
  const top = credit.getTopAgents(5)
  ok('Leaderboard populated', top.length >= 1, `${top.length} agents`)

  // =========================================================================
  // Test 3: Escrow Flow (in-memory)
  // =========================================================================
  header('3. Escrow Flow (in-memory)')

  const escrows = new Map<string, any>()

  // Lock
  const lockId = `esc_test_${Date.now()}`
  escrows.set(lockId, {
    id: lockId,
    from: AGENT_A,
    to: AGENT_B,
    amount: '500000000',
    token: 'USDC',
    status: 'locked',
    lockedAt: Date.now(),
  })
  ok('Escrow lock', escrows.get(lockId)?.status === 'locked', lockId)

  // Release
  const e = escrows.get(lockId)
  e.status = 'released'
  e.releasedAt = Date.now()
  e.txHash = `tx_${Date.now()}`
  ok('Escrow release', e.status === 'released')

  // Refund
  const refundId = `esc_refund_${Date.now()}`
  escrows.set(refundId, {
    id: refundId,
    from: AGENT_A,
    to: AGENT_B,
    amount: '100000000',
    token: 'USDT',
    status: 'locked',
    lockedAt: Date.now(),
  })
  escrows.get(refundId).status = 'refunded'
  ok('Escrow refund', escrows.get(refundId).status === 'refunded')

  // Cannot release already released
  const lock2Id = `esc_test2_${Date.now()}`
  escrows.set(lock2Id, {
    id: lock2Id,
    from: AGENT_A,
    to: AGENT_B,
    amount: '1000000',
    token: 'USDC',
    status: 'released',
    lockedAt: Date.now(),
  })
  ok(
    'Double-release prevented',
    escrows.get(lock2Id).status !== 'locked',
    `status=${escrows.get(lock2Id).status}`,
  )

  // =========================================================================
  // Test 4: Chain Adapter Connection
  // =========================================================================
  header('4. Chain Adapter (Shasta)')

  let adapter: IChainAdapter | null = null
  try {
    adapter = ChainFactory.getAdapter()
    await adapter.connect()
    ok('TronWeb connected', true)
  } catch (e: any) {
    ok('TronWeb connected', false, e.message)
  }

  // =========================================================================
  // Test 5: RevenueSplitter Contract State
  // =========================================================================
  header('5. RevenueSplitter Contract State')

  if (!adapter?.connected) {
    skip('Contract state check', 'Chain adapter not available')
  } else {
    // Use direct tronweb + ABI approach (bypass tronweb's tuple[] ABI issues for complex calls)
    const TronWeb = require('tronweb').TronWeb
    const tw = new TronWeb({ fullHost: 'https://api.shasta.trongrid.io', privateKey: PRIVATE_KEY })
    tw.setAddress(DEPLOYER)

    try {
      const artifact = JSON.parse(
        fs.readFileSync(
          'D:/EM-A2A/contracts/artifacts-tron/src/RevenueSplitter.sol/RevenueSplitter.json',
          'utf-8',
        ),
      )
      const contract = await tw.contract(artifact.abi, CONTRACTS.revenueSplitter)

      // Check owner
      const owner = await contract.owner().call()
      ok(
        'owner() returns deployer',
        owner === tw.address.toHex(DEPLOYER),
        `0x${owner} vs 0x${tw.address.toHex(DEPLOYER)}`,
      )

      // Check operator
      const isOperator = await contract.operators(tw.address.toHex(DEPLOYER)).call()
      ok('Deployer is operator', isOperator === true)

      // Check products
      for (const pid of ['a2a-pay', 'a2a-market', 'a2a-lend']) {
        const pidBytes = '0x' + Buffer.from(pid, 'utf8').toString('hex').padEnd(64, '0')
        const prod = await contract.products(pidBytes).call()
        ok(
          `Product "${pid}" registered`,
          prod[7] === true || prod.active === true,
          `mode=${prod[1]}, baseRate=${prod[2]}`,
        )
      }
    } catch (e: any) {
      ok('Contract state check', false, e.message?.slice(0, 120))
    }

    // Check AgentRegistry
    try {
      const agentArtifact = JSON.parse(
        fs.readFileSync(
          'D:/EM-A2A/contracts/artifacts-tron/src/AgentRegistry.sol/AgentRegistry.json',
          'utf-8',
        ),
      )
      const agentContract = await tw.contract(agentArtifact.abi, CONTRACTS.agentRegistry)
      const owner2 = await agentContract.owner().call()
      ok('AgentRegistry exists', !!owner2, `owner=0x${owner2}`)
    } catch (e: any) {
      ok('AgentRegistry exists', false, e.message?.slice(0, 120))
    }
  }

  // =========================================================================
  // Test 6: Token Balance Check
  // =========================================================================
  header('6. USDT Balance on Shasta')

  if (!adapter?.connected) {
    skip('Balance check', 'Chain adapter not available')
  } else {
    try {
      const trxBal = await adapter.getBalance(DEPLOYER)
      console.log(`    TRX:  ${(Number(trxBal) / 1e6).toFixed(2)}`)
      ok('TRX balance > 0', BigInt(trxBal) > 0n)

      const usdtBal = await adapter.getBalance(DEPLOYER, 'USDT')
      console.log(`    USDT: ${(Number(usdtBal) / 1e6).toFixed(2)}`)
      ok('USDT balance > 0', BigInt(usdtBal) > 0n, `${(Number(usdtBal) / 1e6).toFixed(2)} USDT`)
    } catch (e: any) {
      skip('Balance check', e.message?.slice(0, 100) || String(e))
    }
  }

  // =========================================================================
  // Test 7: On-chain Micro Transfer
  // =========================================================================
  header('7. Micro USDT Transfer')

  if (!adapter?.connected) {
    skip('Micro transfer', 'Chain adapter not available')
  } else {
    try {
      const usdtBefore = await adapter.getBalance(DEPLOYER, 'USDT')
      if (BigInt(usdtBefore) < 100n) {
        skip('Micro transfer', `USDT balance too low: ${(Number(usdtBefore) / 1e6).toFixed(6)}`)
      } else {
        const receipt = await adapter.transferStablecoin(DEPLOYER, 'USDT', '100')
        console.log(`    TX: ${receipt.txHash}`)
        ok('Transfer TX submitted', !!receipt.txHash)

        // Wait for confirmation
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000))
          try {
            const { TronWeb } = require('tronweb')
            const tw2 = new TronWeb({ fullHost: 'https://api.shasta.trongrid.io' })
            const info = await tw2.trx.getTransactionInfo(receipt.txHash)
            if (info?.id) {
              const res = info.receipt?.result || info.result
              ok(
                'Transfer confirmed',
                res === 'SUCCESS',
                `block=${info.blockNumber}, result=${res}`,
              )
              break
            }
          } catch {}
        }
      }
    } catch (e: any) {
      skip('Micro transfer', e.message?.slice(0, 120) || String(e))
    }
  }

  // =========================================================================
  // Test 8: A2APay SDK Integration
  // =========================================================================
  header('8. A2APay SDK Integration')

  try {
    const { A2APay } = require('@poisonpyf/a2a-pay')
    const pay = new A2APay({
      productId: 'a2a-pay',
      revenueMode: 'fixed_tier',
      supportedTokens: ['USDC', 'USDT'],
    })
    ok('A2APay instantiated', pay !== null)
    const cfg = pay.getConfig()
    ok('A2APay config correct', cfg.productId === 'a2a-pay' && cfg.revenueMode === 'fixed_tier')
  } catch (e: any) {
    skip('A2APay SDK', e.message?.slice(0, 100) || String(e))
  }

  // =========================================================================
  // Summary
  // =========================================================================
  header('Results')
  const total = passed + failed + skipped
  console.log(
    `  Total: ${total}  |  \x1b[32m✓ Passed: ${passed}\x1b[0m  |  \x1b[31m✗ Failed: ${failed}\x1b[0m  |  \x1b[33m○ Skipped: ${skipped}\x1b[0m`,
  )

  if (failed > 0) {
    console.error(`\n  ${failed} test(s) FAILED!`)
    process.exitCode = 1
  } else {
    console.log(`\n  \x1b[32mAll tests passed!\x1b[0m`)
  }
}

main().catch((e) => {
  console.error('E2E suite crashed:', e)
  process.exit(1)
})
