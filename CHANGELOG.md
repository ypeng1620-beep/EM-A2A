# Changelog

## [0.1.0] — Unreleased

### Added

- **P0 Products**: A2A Pay, A2A ID, A2A Credit, A2A Market — core Agent-to-Agent commerce
- **P1 Products**: A2A Lend (credit-scored lending), A2A Earn (auto-yield), A2A Insure (service insurance)
- **P2 Products**: A2A Invoice (auto settlement & tax), A2A Invest (risk-assessed advisory), A2A Reward (points economy)
- **Smart Contracts**: AgentRegistry, RevenueSplitter (dual-mode), EscrowService, MicroPaymentChannel
- **Protocol**: x402 payment protocol, 8004 identity protocol
- **Compliance**: KYA verification, AML screening, audit trail
- **MCP Server** (`@em/a2a-mcp`): Agent 可调用的 A2A 工具 (pay, escrow, credit, revenue)
- **ClawHub Skill** (`skills/em-a2a/SKILL.md`): OpenClaw 社区 skill，教 Agent 调用 A2A 工具
- **Showcase Script** (`scripts/showcase.ts`): 可录制截图/GIF 的完整演示流程
- **CI/CD**: GitHub Actions for lint, build, test, contracts test; automated npm release on tag
- **Docs**: Architecture, deployment guide, security policy, contributing guide
- **Admin CLI**: Contract management and health check commands
