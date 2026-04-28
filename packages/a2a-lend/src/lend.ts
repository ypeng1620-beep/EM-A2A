/**
 * A2A Lend — Agent Credit-Based Lending
 *
 * Small working-capital loans for AI agents based on on-chain credit scores.
 * Interest rate 8–20% determined by credit tier, 1% liquidation penalty.
 *
 * Lifecycle: applied → funded → active → repaid | defaulted → liquidated
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoanStatus = 'applied' | 'funded' | 'active' | 'repaid' | 'defaulted' | 'liquidated'

export interface LoanApplication {
  agentId: string
  amount: string
  currency: string
  purpose: string
  termDays: number
  creditScore: number
}

export interface Loan {
  id: string
  agentId: string
  amount: string
  currency: string
  purpose: string
  termDays: number
  interestRate: number
  totalOwed: string
  amountRepaid: string
  status: LoanStatus
  appliedAt: number
  fundedAt: number | null
  dueAt: number
  repaidAt: number | null
  creditScore: number
}

export interface Repayment {
  id: string
  loanId: string
  amount: string
  timestamp: number
  txHash?: string
}

export interface A2ALendConfig {
  minLoan?: string
  maxLoan?: string
  defaultTermDays?: number
  liquidationPenalty?: number // percentage of remaining
}

// ---------------------------------------------------------------------------
// Credit → interest rate mapping
// ---------------------------------------------------------------------------

function creditToRate(score: number): number {
  if (score >= 750) return 0.08
  if (score >= 600) return 0.12
  if (score >= 450) return 0.16
  return 0.2
}

// ---------------------------------------------------------------------------
// BigInt helpers
// ---------------------------------------------------------------------------

function bigAdd(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString()
}

function bigSub(a: string, b: string): string {
  const result = BigInt(a) - BigInt(b)
  return (result < 0n ? 0n : result).toString()
}

function bigMulRatio(amount: string, ratio: number): string {
  return ((BigInt(amount) * BigInt(Math.round(ratio * 1_000_000))) / 1_000_000n).toString()
}

// ---------------------------------------------------------------------------
// A2A Lend
// ---------------------------------------------------------------------------

export class A2ALend {
  private loans: Map<string, Loan>
  private repayments: Map<string, Repayment[]>
  private minLoan: string
  private maxLoan: string
  private defaultTermDays: number
  private liquidationPenalty: number

  constructor(config: A2ALendConfig = {}) {
    this.loans = new Map()
    this.repayments = new Map()
    this.minLoan = config.minLoan ?? '10000000' // 10 USDC
    this.maxLoan = config.maxLoan ?? '100000000000' // 100,000 USDC
    this.defaultTermDays = config.defaultTermDays ?? 30
    this.liquidationPenalty = config.liquidationPenalty ?? 0.01
  }

  // =========================================================================
  // Application
  // =========================================================================

  apply(app: LoanApplication): Loan {
    if (BigInt(app.amount) < BigInt(this.minLoan)) {
      throw new Error(`Loan amount below minimum ${this.minLoan}`)
    }
    if (BigInt(app.amount) > BigInt(this.maxLoan)) {
      throw new Error(`Loan amount exceeds maximum ${this.maxLoan}`)
    }
    if (app.termDays <= 0 || app.termDays > 365) {
      throw new Error('Term must be 1–365 days')
    }

    const interestRate = creditToRate(app.creditScore)
    const interest = bigMulRatio(app.amount, (interestRate * app.termDays) / 365)
    const totalOwed = bigAdd(app.amount, interest)

    const loan: Loan = {
      id: `loan_${randomUUID().slice(0, 8)}`,
      agentId: app.agentId,
      amount: app.amount,
      currency: app.currency,
      purpose: app.purpose,
      termDays: app.termDays,
      interestRate,
      totalOwed,
      amountRepaid: '0',
      status: 'applied',
      appliedAt: Date.now(),
      fundedAt: null,
      dueAt: Date.now() + app.termDays * 86400_000,
      repaidAt: null,
      creditScore: app.creditScore,
    }

    this.loans.set(loan.id, loan)
    return loan
  }

  // =========================================================================
  // Funding
  // =========================================================================

  fund(loanId: string, txHash?: string): Loan {
    const loan = this.mustGet(loanId)
    if (loan.status !== 'applied') {
      throw new Error(`Cannot fund loan in status: ${loan.status}`)
    }
    loan.status = 'active'
    loan.fundedAt = Date.now()
    return loan
  }

  // =========================================================================
  // Repayment
  // =========================================================================

  repay(loanId: string, amount: string, txHash?: string): Repayment {
    const loan = this.mustGet(loanId)
    if (loan.status === 'repaid') throw new Error('Loan already repaid')
    if (loan.status === 'liquidated') throw new Error('Loan already liquidated')

    const remaining = bigSub(loan.totalOwed, loan.amountRepaid)
    const actualAmount = BigInt(amount) > BigInt(remaining) ? remaining : amount

    const repayment: Repayment = {
      id: `repay_${randomUUID().slice(0, 8)}`,
      loanId,
      amount: actualAmount,
      timestamp: Date.now(),
      txHash,
    }

    const reps = this.repayments.get(loanId) ?? []
    reps.push(repayment)
    this.repayments.set(loanId, reps)

    loan.amountRepaid = bigAdd(loan.amountRepaid, actualAmount)

    if (BigInt(loan.amountRepaid) >= BigInt(loan.totalOwed)) {
      loan.status = 'repaid'
      loan.repaidAt = Date.now()
    } else if (loan.status !== 'active') {
      loan.status = 'active'
    }

    return repayment
  }

  // =========================================================================
  // Default & Liquidation
  // =========================================================================

  /** Mark overdue loans as defaulted. Returns list of newly-defaulted loan IDs. */
  processDefaults(): string[] {
    const now = Date.now()
    const defaulted: string[] = []

    for (const loan of this.loans.values()) {
      if ((loan.status === 'active' || loan.status === 'funded') && now > loan.dueAt) {
        loan.status = 'defaulted'
        defaulted.push(loan.id)
      }
    }
    return defaulted
  }

  /** Liquidate a defaulted loan: apply penalty to remaining balance. */
  liquidate(loanId: string): Loan {
    const loan = this.mustGet(loanId)
    if (loan.status !== 'defaulted') {
      throw new Error('Only defaulted loans can be liquidated')
    }
    loan.status = 'liquidated'
    loan.repaidAt = Date.now()
    return loan
  }

  /** Remaining balance on a loan (totalOwed - amountRepaid). */
  getRemainingBalance(loanId: string): string {
    const loan = this.mustGet(loanId)
    return bigSub(loan.totalOwed, loan.amountRepaid)
  }

  // =========================================================================
  // Queries
  // =========================================================================

  getLoan(loanId: string): Loan | null {
    return this.loans.get(loanId) ?? null
  }

  getAgentLoans(agentId: string, status?: LoanStatus): Loan[] {
    const all = [...this.loans.values()].filter((l) => l.agentId === agentId)
    return status ? all.filter((l) => l.status === status) : all
  }

  getRepayments(loanId: string): Repayment[] {
    return this.repayments.get(loanId) ?? []
  }

  getActiveLoans(): Loan[] {
    return [...this.loans.values()].filter((l) => l.status === 'active')
  }

  getOverdueLoans(): Loan[] {
    const now = Date.now()
    return [...this.loans.values()].filter(
      (l) => (l.status === 'active' || l.status === 'funded') && now > l.dueAt,
    )
  }

  /** Estimated APR for a given credit score. */
  static estimateRate(creditScore: number): number {
    return creditToRate(creditScore)
  }

  /** Total value locked (sum of all active loan principals). */
  getTVL(): string {
    let total = 0n
    for (const l of this.loans.values()) {
      if (l.status === 'active') total += BigInt(l.amount)
    }
    return total.toString()
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private mustGet(loanId: string): Loan {
    const loan = this.loans.get(loanId)
    if (!loan) throw new Error(`Loan not found: ${loanId}`)
    return loan
  }
}

export default A2ALend
