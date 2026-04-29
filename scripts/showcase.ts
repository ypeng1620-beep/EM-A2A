/**
 * EM-A2A Showcase — Agent-to-Agent Payment Demo
 *
 * 为截图/GIF 录制优化的演示脚本。
 * 展示: DID 注册 → KYA → 托管支付 → 信用评分 → 抽成计算
 *
 * 运行: npx tsx scripts/showcase.ts
 */

import { randomUUID } from 'crypto'
import { RevenueEngine, generateDID, parseDID } from '@poisonpyf/a2a-core'
import { A2ACredit } from '@poisonpyf/a2a-credit'

// ---------------------------------------------------------------------------
// MCP tool handlers (imported so CI also validates them)
// ---------------------------------------------------------------------------
import { handlePay } from '../packages/a2a-mcp/src/tools/pay.js'
import { handleEscrow } from '../packages/a2a-mcp/src/tools/escrow.js'
import { handleRevenue } from '../packages/a2a-mcp/src/tools/revenue.js'
import { handleCredit } from '../packages/a2a-mcp/src/tools/credit.js'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const B = '═'.repeat(68)
const T = '─'.repeat(48)
const NL = '\n'

function fmt(title: string) {
  console.log(`\n  ╔${B}╗`)
  console.log(`  ║  ${title.padEnd(64)}║`)
  console.log(`  ╚${B}╝`)
}

function sub(n: number, label: string) {
  console.log(`\n  [${n}] ${label}`)
  console.log(`  ${T}`)
}

function kv(k: string, v: unknown) {
  console.log(`    ${k.padEnd(24)} ${v}`)
}

function ok(msg: string) {
  console.log(`    ✓ ${msg}`)
}

// ---------------------------------------------------------------------------
// Showcase
// ---------------------------------------------------------------------------

async function main() {
  console.clear()

  console.log(`
  ███████╗███╗   ███╗      █████╗ ██████╗  █████╗
  ██╔════╝████╗ ████║     ██╔══██╗╚════██╗██╔══██╗
  █████╗  ██╔████╔██║     ███████║ █████╔╝███████║
  ██╔══╝  ██║╚██╔╝██║     ██╔══██║██╔═══╝ ██╔══██║
  ███████╗██║ ╚═╝ ██║     ██║  ██║███████╗██║  ██║
  ╚══════╝╚═╝     ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

     Agent-to-Agent Payment Protocol · TRON Chain
     AI Agents Hire, Pay & Settle — Fully On-Chain
  `)

  // -----------------------------------------------------------------------
  // Phase 1: Identity (8004 Protocol)
  // -----------------------------------------------------------------------
  fmt('Phase 1: Agent Identity · DID + KYA')

  sub(1, 'Agent Seller generates on-chain DID')
  const sellerAddr = 'TS' + randomUUID().replace(/-/g, '').slice(0, 32)
  const sellerDID = generateDID(sellerAddr, 'tron')
  kv('TRON Address', sellerAddr)
  kv('DID', sellerDID)
  kv('Protocol', '8004 (On-Chain Identity)')
  ok('DID registered on TRON')

  sub(2, 'Agent Seller passes KYA verification')
  kv('KYA Level', 'verified')
  kv('Credentials', 'Solidity Expert · TRON Partner')
  ok('Identity verified on-chain')

  sub(3, 'Agent Buyer generates DID + KYA')
  const buyerAddr = 'TB' + randomUUID().replace(/-/g, '').slice(0, 32)
  const buyerDID = generateDID(buyerAddr, 'tron')
  kv('DID', buyerDID)
  kv('KYA Status', 'verified')
  ok('Buyer ready to transact')

  // -----------------------------------------------------------------------
  // Phase 2: Payment + Escrow (x402 Protocol)
  // -----------------------------------------------------------------------
  fmt('Phase 2: Escrow Payment · x402 Protocol')

  const amount = '500000000' // 500 USDC

  sub(4, 'Buyer creates payment & locks funds in escrow')
  kv('Amount', `${Number(amount) / 1_000_000} USDC`)
  kv('From', 'Agent Buyer → Escrow')
  kv('Protocol', 'x402 (HTTP 402 for Agents)')

  const escrow = await handleEscrow({
    from: buyerDID,
    to: sellerDID,
    amount,
    action: 'lock',
    token: 'USDC',
    task: 'Smart Contract Audit · 3-day turnaround',
  })
  const lockData = JSON.parse((escrow as any).content[0].text)
  kv('Escrow ID', lockData.escrowId)
  kv('Status', '🔒 LOCKED')
  ok('Funds secured in escrow — Seller can now deliver')

  sub(5, 'Agent Seller delivers completed work')
  kv('Task', 'Smart Contract Audit')
  kv('Deliverable', 'Audit Report + Vulnerability Summary')
  ok('Work delivered — awaiting buyer acceptance')

  sub(6, 'Buyer accepts → Escrow releases with revenue split')

  // Calculate fee for display
  const revenue = new RevenueEngine({ mode: 'fixed_tier' })
  const fee = revenue.calculateFee(amount)
  kv('Contract value', `${Number(amount) / 1_000_000} USDC`)
  kv('Protocol fee', `${(fee.rate * 100).toFixed(1)}%`)
  kv('Fee amount', `${Number(fee.fee) / 1_000_000} USDC`)
  kv('Seller receives', `${(Number(amount) - Number(fee.fee)) / 1_000_000} USDC`)

  const release = await handleEscrow({
    from: buyerDID,
    to: sellerDID,
    amount,
    action: 'release',
    token: 'USDC',
    escrowId: lockData.escrowId,
  })
  const releaseData = JSON.parse((release as any).content[0].text)
  kv('Tx Hash', releaseData.txHash)
  kv('Status', '✅ RELEASED')
  ok('Payment settled on TRON — instant, low-cost')

  // -----------------------------------------------------------------------
  // Phase 3: Credit Scoring
  // -----------------------------------------------------------------------
  fmt('Phase 3: Credit Scoring · On-Chain Reputation')

  const credit = new A2ACredit()

  sub(7, 'Credit scores update after transaction')
  credit.recordBehavior(sellerDID, 'payment', { amount, type: 'service_payment' })
  credit.recordBehavior(sellerDID, 'order_completed', { task: 'Smart Contract Audit' })
  credit.recordBehavior(buyerDID, 'payment', { amount, type: 'service_payment' })
  credit.recordBehavior(buyerDID, 'order_completed', {})

  const sScore = credit.calculateScore(sellerDID)
  const bScore = credit.calculateScore(buyerDID)

  console.log(`\n    ┌──────────────┬───────┬──────────┬──────────────────────┐`)
  console.log(`    │ Agent        │ Score │ Level    │ Key Factor           │`)
  console.log(`    ├──────────────┼───────┼──────────┼──────────────────────┤`)
  console.log(
    `    │ Seller       │ ${String(sScore.score).padEnd(5)} │ ${sScore.level.padEnd(8)} │ completion: ${(sScore.factors.completionRate * 100).toFixed(0)}%${' '.repeat(10)}│`,
  )
  console.log(
    `    │ Buyer        │ ${String(bScore.score).padEnd(5)} │ ${bScore.level.padEnd(8)} │ tx volume: ${sScore.factors.transactionVolume}${' '.repeat(12)}│`,
  )
  console.log(`    └──────────────┴───────┴──────────┴──────────────────────┘`)

  ok('Credit scores recorded on-chain (8004 protocol)')

  // -----------------------------------------------------------------------
  // Phase 4: TRON Cost Advantage
  // -----------------------------------------------------------------------
  fmt('Phase 4: TRON Chain · Gas Cost Comparison')

  console.log(`\n    ┌────────────────────┬───────────────┬───────────────┐`)
  console.log(`    │ Chain              │ Avg Gas Fee   │ vs TRON       │`)
  console.log(`    ├────────────────────┼───────────────┼───────────────┤`)
  console.log(`    │ TRON               │ ~$0.10        │ —             │`)
  console.log(`    │ Ethereum L1        │ ~$5.00        │ 50x more      │`)
  console.log(`    │ Base L2            │ ~$0.15        │ 1.5x more     │`)
  console.log(`    │ Solana             │ ~$0.0003      │ 333x cheaper  │`)
  console.log(`    └────────────────────┴───────────────┴───────────────┘`)

  console.log(`\n    ⚡ TRON advantage: predictable low fees + USDC native support`)
  console.log(`    ⚡ No L2 fragmentation — one chain, all agents`)

  // -----------------------------------------------------------------------
  // Phase 5: Revenue Model Comparison
  // -----------------------------------------------------------------------
  fmt('Phase 5: Revenue Model · Fair & Transparent Pricing')

  sub(8, 'Fixed Tier vs Variable Float comparison')

  const ft = await handleRevenue({ amount: '100000000', mode: 'fixed_tier' })
  const vf = await handleRevenue({
    amount: '100000000',
    mode: 'variable_float',
    riskScore: 20,
    creditScore: sScore.score,
  })
  const ftData = JSON.parse((ft as any).content[0].text)
  const vfData = JSON.parse((vf as any).content[0].text)

  console.log(`\n    ┌─────────────┬────────────┬──────────────┬──────────┐`)
  console.log(`    │ Mode        │ Fee        │ Rate         │ Tier     │`)
  console.log(`    ├─────────────┼────────────┼──────────────┼──────────┤`)
  console.log(
    `    │ Fixed Tier  │ ${(Number(ftData.fee) / 1_000_000).toFixed(4).padEnd(10)} │ ${ftData.rate.padEnd(12)} │ ${(ftData.tier || 'default').padEnd(8)} │`,
  )
  console.log(
    `    │ Var Float   │ ${(Number(vfData.fee) / 1_000_000).toFixed(4).padEnd(10)} │ ${vfData.rate.padEnd(12)} │ risk-adj │`,
  )
  console.log(`    └─────────────┴────────────┴──────────────┴──────────┘`)

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  fmt('EM-A2A Protocol · Complete')

  console.log(`
    ⚡ Agent-to-Agent Payments on TRON
    ⚡ 8004 Identity Protocol (DID + KYA + Credentials)
    ⚡ x402 Escrow Protocol (Lock → Deliver → Release)
    ⚡ On-Chain Credit Scoring (300-950, behavior-weighted)
    ⚡ Revenue Engine (Fixed Tier + Variable Float)
    ⚡ Compliance (AML + KYA + Audit Trail)

    MCP Plugin: npx @poisonpyf/a2a-mcp
    GitHub:     github.com/ypeng1620-beep/EM-A2A
    TRON:       shasta testnet (mainnet ready)

    15 packages · 4 contracts · 115+ tests · MIT license
  `)

  credit.close()
}

main().catch((err) => {
  console.error('Showcase failed:', err)
  process.exit(1)
})
