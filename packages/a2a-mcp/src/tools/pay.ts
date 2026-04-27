import { z } from 'zod/v4'
import { getPay } from '../state.js'

export const paySchema = z.object({
  from: z.string().describe('Sender agent DID (e.g. did:tron:0xabc...)'),
  to: z.string().describe('Recipient agent DID'),
  token: z.string().default('USDC').describe('Token: USDC or USDT'),
  amount: z.string().describe('Amount in token precision (6 decimals). "1000000" = 1 USDC'),
  memo: z.string().optional().describe('Optional memo for the transaction'),
})

export async function handlePay(args: z.infer<typeof paySchema>) {
  const pay = getPay()
  try {
    const result = await pay.transfer({
      from: args.from,
      to: args.to,
      token: (args.token as 'USDC' | 'USDT') || 'USDC',
      amount: args.amount,
      memo: args.memo,
    })

    if (!result.success) {
      return {
        content: [{ type: 'text' as const, text: `Payment failed: ${result.error}` }],
        isError: true,
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              txHash: result.receipt?.txHash,
              fee: result.fee,
              feeRate: `${((result.feeRate || 0) * 100).toFixed(2)}%`,
              netAmount: result.netAmount,
              from: args.from,
              to: args.to,
              token: args.token || 'USDC',
            },
            null,
            2,
          ),
        },
      ],
    }
  } catch (e: any) {
    return {
      content: [{ type: 'text' as const, text: `Payment error: ${e.message}` }],
      isError: true,
    }
  }
}
