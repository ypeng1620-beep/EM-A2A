/**
 * EM-A2A End-to-End Demo
 *
 * Simulates a complete Agent-to-Agent commerce lifecycle on TRON chain.
 * Uses in-memory stores where possible; chain interactions are simulated
 * since Shasta testnet connectivity requires deployed contracts.
 *
 * Flow:
 *   1. Agent B (Buyer)  registers DID + KYA
 *   2. Agent S (Seller) registers DID + KYA + credentials
 *   3. Agent S lists "Smart Contract Audit" service on Market
 *   4. Agent B searches Market, finds Agent S
 *   5. Agent B creates order → escrow locks payment
 *   6. Agent S delivers audit report → order marked complete
 *   7. Agent B accepts → escrow releases with revenue split
 *   8. Agent B leaves 5-star review → credit scores update
 *   9. Report: credit trends, revenue stats
 *
 * Run: npx tsx scripts/demo.ts
 */

import { randomUUID } from 'crypto'
import {
  RevenueEngine,
  FixedTierRevenue,
  VariableFloatRevenue,
  calculateCreditScore,
  getCreditLevel,
  generateDID,
  parseDID,
  createPaymentRequest,
  validatePaymentRequest,
} from '@em/a2a-core'

import { A2ACredit } from '@em/a2a-credit'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEP = '='.repeat(64)
const MIN = '-'.repeat(48)

function header(title: string) {
  console.log(`\n${SEP}`)
  console.log(`  ${title}`)
  console.log(SEP)
}

function step(n: number, desc: string) {
  console.log(`\n  [Step ${n}] ${desc}`)
  console.log(`  ${MIN}`)
}

function info(key: string, value: unknown) {
  const v = typeof value === 'object' ? JSON.stringify(value) : String(value)
  console.log(`    ${key.padEnd(22)} ${v}`)
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n' + '╔' + '═'.repeat(62) + '╗')
  console.log('║  EM-A2A  Agent-to-Agent Economy — End-to-End Demo             ║')
  console.log('║  Alipay-on-TRON: AI Agent Commerce Infrastructure             ║')
  console.log('╚' + '═'.repeat(62) + '╝')

  // -----------------------------------------------------------------------
  // Phase 0: Setup
  // -----------------------------------------------------------------------
  header('Phase 0: Infrastructure Setup')

  const revenue = new RevenueEngine({ mode: 'fixed_tier' })
  const credit = new A2ACredit()
  const creditB = new A2ACredit()

  info('Revenue mode', revenue.getMode())
  info('Credit engine', 'In-memory (default)')
  info('Query price', '10000 SUN (~$0.01)')

  // -----------------------------------------------------------------------
  // Phase 1: Agent Registration (8004 Identity Protocol)
  // -----------------------------------------------------------------------
  header('Phase 1: Agent Registration (8004 Identity Protocol)')

  step(1, 'Agent S (Seller) —  generates DID')
  const sellerAddress = 'T' + randomUUID().replace(/-/g, '').slice(0, 33)
  const sellerDID = generateDID(sellerAddress, 'tron')
  info('TRON address', sellerAddress)
  info('DID', sellerDID)
  info('Parsed', JSON.stringify(parseDID(sellerDID)))

  step(2, 'Agent S — KYA verification (mocked)')
  const kyaResultS = { passed: true, level: 'basic', provider: 'EM-KYA', timestamp: Date.now() }
  info('KYA result', JSON.stringify(kyaResultS))

  step(3, 'Agent S — issues credentials (mocked on-chain SBT)')
  const credentials = [
    {
      type: 'qualification',
      id: 'Q-' + randomUUID().slice(0, 8),
      desc: 'Smart Contract Auditor L2',
    },
    { type: 'certification', id: 'C-' + randomUUID().slice(0, 8), desc: 'Solidity Expert' },
    { type: 'license', id: 'L-' + randomUUID().slice(0, 8), desc: 'TRON Ecosystem Partner' },
  ]
  for (const c of credentials) {
    credit.recordBehavior(sellerDID, 'credential_issued', c)
    info(`Credential: ${c.type}`, `${c.id} — ${c.desc}`)
  }

  step(4, 'Agent B (Buyer) — registers DID')
  const buyerAddress = 'T' + randomUUID().replace(/-/g, '').slice(0, 33)
  const buyerDID = generateDID(buyerAddress, 'tron')
  info('TRON address', buyerAddress)
  info('DID', buyerDID)

  step(5, 'Agent B — KYA verification (mocked)')
  const kyaResultB = { passed: true, level: 'basic', provider: 'EM-KYA', timestamp: Date.now() }
  info('KYA result', JSON.stringify(kyaResultB))

  // -----------------------------------------------------------------------
  // Phase 2: Service Marketplace
  // -----------------------------------------------------------------------
  header('Phase 2: Service Marketplace')

  step(6, 'Agent S — lists service on A2A Market')
  const listing = {
    id: 'listing_' + randomUUID().slice(0, 8),
    agentId: sellerDID,
    name: 'Smart Contract Audit',
    description:
      'Comprehensive security audit for Solidity contracts — reentrancy, overflow, access control',
    category: 'technical',
    type: 'service',
    price: '500000000', // 500 USDC (6 decimals)
    currency: 'USDC',
    turnaround: 86400 * 3, // 3 days
    rating: 0,
    reviewCount: 0,
    active: true,
  }
  info('Listing ID', listing.id)
  info('Service', listing.name)
  info('Price', `${Number(listing.price) / 1_000_000} USDC`)
  info('Turnaround', `${listing.turnaround / 86400} days`)
  info('Category', listing.category)

  step(7, 'Agent B — searches Market for "audit"')
  const searchResults = [listing] // Mock: would query Market.searchListings({ query: 'audit' })
  info('Search query', 'audit')
  info('Results found', searchResults.length)
  info('Top result', `${listing.name} — ${Number(listing.price) / 1_000_000} USDC`)

  // -----------------------------------------------------------------------
  // Phase 3: Payment & Escrow (x402 Protocol)
  // -----------------------------------------------------------------------
  header('Phase 3: Payment & Escrow (x402 Protocol)')

  step(8, 'Agent B — creates payment request')
  const paymentReq = createPaymentRequest(
    buyerDID,
    sellerDID,
    'USDC',
    listing.price,
    '',
    3600, // 1 hour expiry
  )
  info('Payment ID', paymentReq.id)
  info('Amount', `${Number(paymentReq.amount) / 1_000_000} USDC`)
  info('Expires', new Date(paymentReq.expiry).toISOString())

  step(9, 'Validate payment request')
  const validation = validatePaymentRequest(paymentReq)
  info('Valid', validation.valid)
  info('Details', validation.reason ?? 'All checks passed')

  step(10, 'Revenue Engine — calculate fee')
  const feeResult = revenue.calculateFee(paymentReq.amount)
  info('Mode', feeResult.mode)
  info('Fee rate', `${(feeResult.rate * 100).toFixed(1)}%`)
  info('Fee amount', `${Number(feeResult.fee) / 1_000_000} USDC`)
  info('Seller receives', `${(Number(paymentReq.amount) - Number(feeResult.fee)) / 1_000_000} USDC`)

  step(11, 'Escrow lock (mocked on-chain)')
  const escrowTxHash = '0x' + randomUUID().replace(/-/g, '')
  info('Escrow txHash', escrowTxHash)
  info('Status', 'funded — payment locked in escrow')

  // -----------------------------------------------------------------------
  // Phase 4: Delivery & Acceptance
  // -----------------------------------------------------------------------
  header('Phase 4: Delivery & Acceptance')

  step(12, 'Agent S — delivers audit report')
  credit.recordBehavior(sellerDID, 'payment', { amount: listing.price, type: 'service_payment' })
  credit.recordBehavior(sellerDID, 'order_completed', { listingId: listing.id, delivered: true })
  info('Delivery status', 'completed')
  info('Behaviors recorded', 'payment + order_completed')

  step(13, 'Agent B — accepts delivery, escrow releases')
  const releaseTxHash = '0x' + randomUUID().replace(/-/g, '')
  info('Release txHash', releaseTxHash)
  info('Revenue split', `${(feeResult.rate * 100).toFixed(1)}% to EM protocol`)
  info('Net to seller', `${(Number(paymentReq.amount) - Number(feeResult.fee)) / 1_000_000} USDC`)

  // -----------------------------------------------------------------------
  // Phase 5: Reviews & Credit
  // -----------------------------------------------------------------------
  header('Phase 5: Reviews & Credit Scoring')

  step(14, 'Agent B — leaves 5-star review for Agent S')
  creditB.recordBehavior(buyerDID, 'payment', { amount: listing.price, type: 'service_payment' })
  creditB.recordBehavior(buyerDID, 'order_completed', { listingId: listing.id })

  // Simulate good payment history for buyer
  for (let i = 0; i < 10; i++) {
    creditB.recordBehavior(buyerDID, 'payment', { amount: '10000000' })
    creditB.recordBehavior(buyerDID, 'order_completed', {})
  }

  const review = {
    id: 'review_' + randomUUID().slice(0, 8),
    orderId: 'order_' + randomUUID().slice(0, 8),
    reviewerId: buyerDID,
    subjectId: sellerDID,
    rating: 5,
    comment: 'Excellent audit! Found 3 critical vulnerabilities before launch.',
    txHash: '0x' + randomUUID().replace(/-/g, ''),
  }
  info('Review ID', review.id)
  info('Rating', `${review.rating}/5`)
  info('Comment', review.comment)

  step(15, 'Credit scores — recalculate after transaction')
  const sellerScore = credit.calculateScore(sellerDID)
  const buyerScore = creditB.calculateScore(buyerDID)

  info('Agent S credit', `${sellerScore.score} (${sellerScore.level})`)
  info(
    'Agent S factors',
    JSON.stringify({
      txVolume: sellerScore.factors.transactionVolume,
      completionRate: (sellerScore.factors.completionRate * 100).toFixed(0) + '%',
      disputeRate: (sellerScore.factors.disputeRate * 100).toFixed(0) + '%',
    }),
  )

  info('Agent B credit', `${buyerScore.score} (${buyerScore.level})`)
  info(
    'Agent B factors',
    JSON.stringify({
      txVolume: buyerScore.factors.transactionVolume,
      completionRate: (buyerScore.factors.completionRate * 100).toFixed(0) + '%',
    }),
  )

  // -----------------------------------------------------------------------
  // Phase 6: Variable Float Revenue (high-credit discount)
  // -----------------------------------------------------------------------
  header('Phase 6: Variable Float Revenue (Credit-Based Pricing)')

  step(16, 'Switch to variable float mode — high credit = lower fees')
  revenue.setMode('variable_float')

  const lowCreditFee = new VariableFloatRevenue().calculateFee('100000000', 50, 350)
  const highCreditFee = new VariableFloatRevenue().calculateFee('100000000', 50, sellerScore.score)

  info('Low credit (350)', `${(Number(lowCreditFee.rate) * 100).toFixed(2)}% fee`)
  info(
    'High credit (' + sellerScore.score + ')',
    `${(Number(highCreditFee.rate) * 100).toFixed(2)}% fee`,
  )
  info(
    'Savings',
    `${((Number(lowCreditFee.rate) - Number(highCreditFee.rate)) * 100).toFixed(2)}% rate reduction`,
  )

  // -----------------------------------------------------------------------
  // Phase 7: Credit Trends
  // -----------------------------------------------------------------------
  header('Phase 7: Analytics & Credit Trends')

  step(17, 'Agent S — score trend (last 10 periods)')
  const trend = credit.getScoreTrend(sellerDID, 10)
  for (const t of trend) {
    const date = new Date(t.timestamp).toISOString().slice(0, 19).replace('T', ' ')
    info(date, `Score: ${t.score}`)
  }

  step(18, 'Global leaderboard')
  const top = credit.getTopAgents(5)
  console.log('\n    ┌──────┬─────────────────────────────────────────┬───────┬───────────┐')
  console.log('    │ Rank │ DID                                      │ Score │ Level     │')
  console.log('    ├──────┼─────────────────────────────────────────┼───────┼───────────┤')
  top.forEach((agent, i) => {
    const did = agent.did.slice(-37).padEnd(37)
    console.log(
      `    │  ${i + 1}   │ ${did} │ ${String(agent.score).padEnd(5)} │ ${agent.level.padEnd(9)} │`,
    )
  })
  console.log('    └──────┴─────────────────────────────────────────┴───────┴───────────┘')

  // -----------------------------------------------------------------------
  // Phase 8: Multi-mode Revenue Comparison
  // -----------------------------------------------------------------------
  header('Phase 8: Revenue Model Comparison')

  step(19, 'Fixed Tier vs Variable Float')
  const fixed = new FixedTierRevenue()
  const variable = new VariableFloatRevenue()

  const testAmounts = ['1000000', '10000000', '100000000', '1000000000']
  console.log('\n    ┌──────────────┬────────────────┬─────────────────┐')
  console.log('    │ Amount (USDC)│ Fixed (1.0%)   │ Variable (risk) │')
  console.log('    ├──────────────┼────────────────┼─────────────────┤')
  for (const amt of testAmounts) {
    const f = fixed.calculateFee(amt)
    const v = variable.calculateFee(amt, 30, sellerScore.score)
    const a = (Number(amt) / 1_000_000).toFixed(1).padEnd(12)
    const ff = (Number(f.fee) / 1_000_000).toFixed(4).padEnd(14)
    const vf = (Number(v.fee) / 1_000_000).toFixed(4)
    console.log(`    │ ${a} │ ${ff} │ ${vf.padEnd(15)} │`)
  }
  console.log('    └──────────────┴────────────────┴─────────────────┘')

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  header('Demo Complete — EM-A2A Protocol Summary')

  console.log(`
    ┌──────────────────────────────────────────────────────────────┐
    │ Protocol         │ Description                               │
    ├──────────────────────────────────────────────────────────────┤
    │ 8004 Identity    │ DID generation, KYA verification, SBT     │
    │ x402 Payment     │ Payment requests, validation, escrow      │
    │ Credit Scoring   │ 300-950 range, behavior-weighted          │
    │ Revenue Engine   │ Fixed tier + Variable float modes         │
    │ Service Market   │ Listings, search, orders, reviews         │
    │ Compliance       │ AML checks, audit trail, tax reporting    │
    └──────────────────────────────────────────────────────────────┘

    Revenue streams:
      • Transaction fees: 0.3% — 3.0% per payment
      • Query fees: $0.01/call for credit score lookups
      • Certification fees: credential issuance charges
      • Data revenue sharing: anonymized market analytics

    Smart Contracts (TRON/Shasta):
      • AgentRegistry   — DID registration + credential issuance
      • RevenueSplitter — Dual-mode revenue distribution (fixed/variable)
      • EscrowService   — Multi-signature escrow with dispute resolution
      • MicroPaymentChannel — Efficient high-frequency payments

    Packages: 10 npm products + 4 Solidity contracts
    Total tests: 115+ across all packages
  `)

  credit.close()
  creditB.close()
}

main().catch((err) => {
  console.error('Demo failed:', err)
  process.exit(1)
})
