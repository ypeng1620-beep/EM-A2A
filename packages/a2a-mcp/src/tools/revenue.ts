import { z } from 'zod/v4'
import { RevenueEngine } from '@poisonpyf/a2a-core'
import type { RevenueMode } from '@poisonpyf/a2a-core'

export const revenueSchema = z.object({
  amount: z.string().describe('Transaction amount. "100000000" = 100 USDC'),
  mode: z.enum(['fixed_tier', 'variable_float']).default('fixed_tier').describe('Revenue mode'),
  riskScore: z.number().optional().describe('Risk score (0-100, for variable_float)'),
  creditScore: z.number().optional().describe('Credit score (300-850, for variable_float)'),
  transactionType: z
    .string()
    .default('standard')
    .describe('Type: standard, high_value, micro, urgent'),
})

export async function handleRevenue(args: z.infer<typeof revenueSchema>) {
  try {
    const mode = args.mode as RevenueMode
    const engine = new RevenueEngine({ mode })
    const result = engine.calculateFee(args.amount, {
      riskScore: args.riskScore,
      creditScore: args.creditScore,
      transactionType: args.transactionType || 'standard',
    })

    const compareMode: RevenueMode = mode === 'fixed_tier' ? 'variable_float' : 'fixed_tier'
    const compareEngine = new RevenueEngine({ mode: compareMode })
    const comparison = compareEngine.calculateFee(args.amount, {
      riskScore: args.riskScore,
      creditScore: args.creditScore,
      transactionType: args.transactionType || 'standard',
    })

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              amount: args.amount,
              mode,
              fee: result.fee,
              rate: `${(result.rate * 100).toFixed(2)}%`,
              tier: result.tier,
              comparison: {
                mode: compareMode,
                fee: comparison.fee,
                rate: `${(comparison.rate * 100).toFixed(2)}%`,
              },
            },
            null,
            2,
          ),
        },
      ],
    }
  } catch (e: any) {
    return {
      content: [{ type: 'text' as const, text: `Revenue error: ${e.message}` }],
      isError: true,
    }
  }
}
