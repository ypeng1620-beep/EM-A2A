import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { paySchema, handlePay } from './tools/pay.js'
import { escrowSchema, handleEscrow } from './tools/escrow.js'
import { revenueSchema, handleRevenue } from './tools/revenue.js'
import { creditSchema, handleCredit } from './tools/credit.js'

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'em-a2a', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.registerTool(
    'a2a_pay',
    {
      description:
        'Transfer USDC/USDT from one agent to another. Handles AML screening, revenue fee calculation, and on-chain execution.',
      inputSchema: paySchema,
    },
    handlePay as any,
  )

  server.registerTool(
    'a2a_escrow',
    {
      description:
        'Lock or release funds in escrow between two agents. Use "lock" to start, "release" on completion, "refund" to return.',
      inputSchema: escrowSchema,
    },
    handleEscrow as any,
  )

  server.registerTool(
    'a2a_revenue',
    {
      description:
        'Calculate the protocol fee for a transaction. Supports fixed_tier (volume-based) and variable_float (risk-adjusted).',
      inputSchema: revenueSchema,
    },
    handleRevenue as any,
  )

  server.registerTool(
    'a2a_credit',
    {
      description:
        'Check agent credit score, level, trend, and global leaderboard. Use before trusting an agent for transactions.',
      inputSchema: creditSchema,
    },
    handleCredit as any,
  )

  return server
}
