import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log(`Deploying contracts with account: ${deployer.address}`)
  console.log(
    `Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} TRX\n`,
  )

  // 1. AgentRegistry
  const AgentRegistry = await ethers.getContractFactory('AgentRegistry')
  const agentRegistry = await AgentRegistry.deploy()
  await agentRegistry.waitForDeployment()
  console.log(`AgentRegistry deployed to: ${await agentRegistry.getAddress()}`)

  // 2. RevenueSplitter
  const RevenueSplitter = await ethers.getContractFactory('RevenueSplitter')
  const revenueSplitter = await RevenueSplitter.deploy()
  await revenueSplitter.waitForDeployment()
  console.log(`RevenueSplitter deployed to: ${await revenueSplitter.getAddress()}`)

  // 3. EscrowService
  const EscrowService = await ethers.getContractFactory('EscrowService')
  const escrowService = await EscrowService.deploy()
  await escrowService.waitForDeployment()
  console.log(`EscrowService deployed to: ${await escrowService.getAddress()}`)

  // 4. MicroPaymentChannel
  const MicroPaymentChannel = await ethers.getContractFactory('MicroPaymentChannel')
  const microPayment = await MicroPaymentChannel.deploy()
  await microPayment.waitForDeployment()
  console.log(`MicroPaymentChannel deployed to: ${await microPayment.getAddress()}`)

  // Summary
  console.log('\n=== Deployment Summary ===')
  console.log(`AGENT_REGISTRY=${await agentRegistry.getAddress()}`)
  console.log(`REVENUE_SPLITTER=${await revenueSplitter.getAddress()}`)
  console.log(`ESCROW_SERVICE=${await escrowService.getAddress()}`)
  console.log(`MICRO_PAYMENT=${await microPayment.getAddress()}`)

  // Set RevenueSplitter as operator on EscrowService
  const tx = await escrowService.setRevenueSplitter(
    await revenueSplitter.getAddress(),
    ethers.encodeBytes32String('a2a-market'),
  )
  await tx.wait()
  console.log('\nEscrowService linked to RevenueSplitter')

  // Register initial products
  const operatorTx = await revenueSplitter.setOperator(deployer.address, true)
  await operatorTx.wait()

  const productIds = [
    { id: 'a2a-pay', mode: 1, rate: 100 }, // FIXED_TIER, 1%
    { id: 'a2a-market', mode: 1, rate: 150 }, // FIXED_TIER, 1.5%
    { id: 'a2a-lend', mode: 2, rate: 150 }, // VARIABLE_FLOAT, 1.5%
  ]

  for (const p of productIds) {
    const pid = ethers.encodeBytes32String(p.id)
    // Only register if not already registered
    try {
      const [, , , , active] = await revenueSplitter.getProductStats(pid)
      if (!active) throw new Error('Not registered')
      console.log(`Product ${p.id} already registered`)
    } catch {
      if (p.mode === 1) {
        const tiers = [
          { monthlyVolumeUSD: 0, rate: p.rate },
          { monthlyVolumeUSD: 10000, rate: (p.rate * 80) / 100 },
          { monthlyVolumeUSD: 100000, rate: (p.rate * 50) / 100 },
        ]
        const tx = await revenueSplitter.registerProduct(
          pid,
          p.mode,
          p.rate,
          tiers,
          (p.rate * 20) / 100,
          p.rate * 5,
        )
        await tx.wait()
      } else {
        const tx = await revenueSplitter.registerProduct(
          pid,
          p.mode,
          p.rate,
          [],
          (p.rate * 20) / 100,
          p.rate * 5,
        )
        await tx.wait()
      }
      console.log(`Product ${p.id} registered`)
    }
  }

  console.log('\nDeployment complete!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
