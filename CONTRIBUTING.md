# Contributing to EM-A2A

## Development Setup

```bash
git clone <repo-url>
cd EM-A2A
pnpm install
pnpm build
```

## Project Structure

```
EM-A2A/
├── contracts/          # Solidity smart contracts (Hardhat)
├── packages/           # TypeScript product packages
│   ├── a2a-core/       # Shared types, chain abstraction, protocol
│   ├── a2a-contracts/  # Contract bindings
│   ├── a2a-compliance/ # KYA/AML/Audit
│   ├── a2a-pay/        # Payment
│   ├── a2a-id/         # Identity
│   ├── a2a-credit/     # Credit scoring
│   ├── a2a-market/     # Service marketplace
│   ├── a2a-lend/       # Lending
│   ├── a2a-earn/       # Yield
│   ├── a2a-insure/     # Insurance
│   ├── a2a-invoice/    # Invoicing & tax
│   ├── a2a-invest/     # Investment advisory
│   └── a2a-reward/     # Behavior incentives
├── scripts/            # Demo & utility scripts
├── cli/                # Admin CLI
└── docs/               # Documentation
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Typecheck all packages |
| `pnpm contracts:compile` | Compile Solidity contracts |
| `pnpm contracts:test` | Run contract tests |

## Conventions

- **TypeScript**: Strict mode, ESM only, project references for inter-package deps
- **Amounts**: Always string type, BigInt arithmetic via helpers (`bigAdd`, `bigSub`, `bigMulRatio`)
- **Tests**: Vitest, test file per package in `test/*.test.ts`
- **Commits**: Conventional commits preferred (`feat:`, `fix:`, `docs:`, `chore:`)

## PR Checklist

- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm contracts:compile` passes
- [ ] New features have tests
- [ ] No new `throw Error("not implemented")` stubs
