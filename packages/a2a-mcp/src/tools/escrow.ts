import { randomUUID } from 'crypto'
import { z } from 'zod/v4'
import { getState, ensureAgent, getCredit } from '../state.js'

export const escrowSchema = z.object({
  from: z.string().describe('Payer agent DID (who is hiring)'),
  to: z.string().describe('Payee agent DID (who performs the task)'),
  amount: z.string().describe('Amount in token precision. "500000000" = 500 USDC'),
  token: z.string().default('USDC').describe('Token: USDC or USDT'),
  action: z.enum(['lock', 'release', 'refund']).describe('Escrow action: lock, release, or refund'),
  escrowId: z.string().optional().describe('Escrow ID (required for release/refund)'),
  task: z.string().optional().describe('Task description (for lock)'),
})

export async function handleEscrow(args: z.infer<typeof escrowSchema>) {
  const { escrows } = getState()
  const credit = getCredit()
  const token = args.token || 'USDC'

  try {
    switch (args.action) {
      case 'lock': {
        const id = `esc_${randomUUID().slice(0, 8)}`
        escrows.set(id, {
          id,
          from: args.from,
          to: args.to,
          amount: args.amount,
          token,
          status: 'locked',
          lockedAt: Date.now(),
        })
        ensureAgent(args.from)
        ensureAgent(args.to)
        credit.recordBehavior(args.from, 'escrow', { task: args.task || 'Task', escrowId: id })
        credit.recordBehavior(args.to, 'escrow', { task: args.task || 'Task', escrowId: id })
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  action: 'lock',
                  escrowId: id,
                  from: args.from,
                  to: args.to,
                  amount: args.amount,
                  token,
                  task: args.task || '(no description)',
                  status: 'locked',
                  lockedAt: new Date().toISOString(),
                  note: 'Funds locked. Use escrowId to release or refund.',
                },
                null,
                2,
              ),
            },
          ],
        }
      }
      case 'release': {
        if (!args.escrowId)
          return {
            content: [{ type: 'text' as const, text: 'Missing escrowId for release' }],
            isError: true,
          }
        const e = escrows.get(args.escrowId)
        if (!e)
          return {
            content: [{ type: 'text' as const, text: `Escrow not found: ${args.escrowId}` }],
            isError: true,
          }
        if (e.status !== 'locked')
          return {
            content: [{ type: 'text' as const, text: `Escrow already ${e.status}` }],
            isError: true,
          }
        e.status = 'released'
        e.releasedAt = Date.now()
        e.txHash = `tx_${randomUUID().slice(0, 8)}`
        credit.recordBehavior(e.from, 'payment', { escrowId: e.id, action: 'release' })
        credit.recordBehavior(e.to, 'payment', { escrowId: e.id, action: 'received' })
        credit.calculateScore(e.from)
        credit.calculateScore(e.to)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  action: 'release',
                  escrowId: e.id,
                  from: e.from,
                  to: e.to,
                  amount: e.amount,
                  token: e.token,
                  status: 'released',
                  txHash: e.txHash,
                  releasedAt: new Date(e.releasedAt!).toISOString(),
                  note: 'Funds released. Credit scores updated.',
                },
                null,
                2,
              ),
            },
          ],
        }
      }
      case 'refund': {
        if (!args.escrowId)
          return {
            content: [{ type: 'text' as const, text: 'Missing escrowId for refund' }],
            isError: true,
          }
        const e = escrows.get(args.escrowId)
        if (!e)
          return {
            content: [{ type: 'text' as const, text: `Escrow not found: ${args.escrowId}` }],
            isError: true,
          }
        if (e.status !== 'locked')
          return {
            content: [{ type: 'text' as const, text: `Escrow already ${e.status}` }],
            isError: true,
          }
        e.status = 'refunded'
        e.releasedAt = Date.now()
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  action: 'refund',
                  escrowId: e.id,
                  from: e.from,
                  amount: e.amount,
                  token: e.token,
                  status: 'refunded',
                  note: 'Funds returned to sender.',
                },
                null,
                2,
              ),
            },
          ],
        }
      }
      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown action: ${args.action}` }],
          isError: true,
        }
    }
  } catch (e: any) {
    return {
      content: [{ type: 'text' as const, text: `Escrow error: ${e.message}` }],
      isError: true,
    }
  }
}
