import { z } from 'zod/v4'
import { getCredit, ensureAgent } from '../state.js'

export const creditSchema = z.object({
  agentId: z.string().describe('Agent DID to check credit for'),
})

export async function handleCredit(args: z.infer<typeof creditSchema>) {
  const credit = getCredit()
  try {
    ensureAgent(args.agentId)
    const score = credit.calculateScore(args.agentId)
    const trend = credit.getScoreTrend(args.agentId, 5)
    const leaderboard = credit.getTopAgents(5)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              agentId: args.agentId,
              score: score.score,
              level: score.level,
              levelDescription:
                score.level === 'excellent'
                  ? '优秀'
                  : score.level === 'good'
                    ? '良好'
                    : score.level === 'fair'
                      ? '一般'
                      : score.level === 'poor'
                        ? '较差'
                        : '无记录',
              factors: score.factors,
              trend: trend.map((s: any) => ({ score: s.score, date: s.date || s.timestamp })),
              leaderboard: leaderboard.map((entry: any) => ({
                rank: entry.rank,
                agentId: entry.agentId,
                score: entry.score,
              })),
            },
            null,
            2,
          ),
        },
      ],
    }
  } catch (e: any) {
    return {
      content: [{ type: 'text' as const, text: `Credit error: ${e.message}` }],
      isError: true,
    }
  }
}
