# Security Policy

## Reporting a Vulnerability

**Do not open a public issue.** Instead, send details to the project maintainers via private channels.

## Scope

The EM-A2A project includes:

1. **Solidity smart contracts** — on-chain revenue engine, escrow, payment channels, identity registry
2. **TypeScript product SDKs** — off-chain business logic for Agent-to-Agent commerce
3. **x402 payment protocol** — stablecoin transfer and fiat on/off-ramp
4. **8004 identity protocol** — Agent DID, SBT credentials, credit scoring

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: Active development |

## Known Attack Surfaces

- **Smart contracts**: Reentrancy on EscrowService release, signature replay on MicroPaymentChannel
- **Off-chain**: KYA/AML bypass if compliance layer is skipped, stale credit scores
- **Protocol**: x402 payment replay across chains, DID impersonation via unverified registrations

## Audit Status

| Component | Auditor | Date | Report |
|-----------|---------|------|--------|
| (pending) | —       | —    | —      |

## Disclosure Timeline

- 0 day: Report received, acknowledged within 24h
- 7 days: Triaged, severity assessed
- 30 days: Fix developed, tested
- 45 days: Fix deployed, public disclosure
