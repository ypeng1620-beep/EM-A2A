#!/usr/bin/env node
/**
 * EM-A2A MCP Server — Entry Point
 *
 * 启动方式:
 *   npx @poisonpyf/a2a-mcp
 *   或作为 MCP stdio transport:
 *   node dist/index.js
 *
 * OpenClaw 配置 (mcpServers):
 *   {
 *     "mcpServers": {
 *       "a2a": {
 *         "command": "npx",
 *         "args": ["@poisonpyf/a2a-mcp"]
 *       }
 *     }
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

async function main() {
  const server = createServer()
  const transport = new StdioServerTransport()

  // Tool count
  const tools = ['a2a_pay', 'a2a_escrow', 'a2a_revenue', 'a2a_credit']

  console.error(`⚡ EM-A2A MCP Server v${process.env.npm_package_version || '0.1.2'}`)
  console.error(`   Network: ${process.env.A2A_NETWORK || 'mainnet'}`)
  console.error(`   Tools: ${tools.join(', ')}`)

  await server.connect(transport)

  console.error('   Server connected (stdio). Waiting for requests...')
}

main().catch((e) => {
  console.error('MCP Server failed to start:', e)
  process.exit(1)
})
