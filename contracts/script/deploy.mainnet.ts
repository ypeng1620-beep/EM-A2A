/**
 * EM-A2A 主网部署脚本
 *
 * 用法: hardhat run script/deploy.mainnet.ts --network tron
 *
 * 前置条件:
 *   1. PRIVATE_KEY 环境变量已设置 (有足够 TRX 支付 gas)
 *   2. 已在 Shasta 测试网验证通过
 *   3. 合约代码已通过安全审计
 *   4. 已确认 Gas 价格和链上状态
 *
 * 安全注意事项:
 *   - 部署后立即将 ownership 转移到多签地址
 *   - 不在脚本中硬编码任何私钥
 *   - 部署地址输出到 deployments/mainnet.json 供后续引用
 */

import { ethers } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

// 多签地址 — 部署完成后 ownership 转移至此
const MULTISIG_ADDRESS = process.env.MULTISIG_ADDRESS || ''
// 初始运营者地址 (可设为部署者或多签)
const INITIAL_OPERATOR = process.env.INITIAL_OPERATOR || ''

interface DeploymentRecord {
  network: string
  chainId: number
  deployedAt: string
  deployer: string
  contracts: Record<string, string>
  productIds: { id: string; mode: number; rate: number }[]
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const deployerAddr = await deployer.getAddress()

  console.log('='.repeat(60))
  console.log('  EM-A2A 主网部署')
  console.log('='.repeat(60))
  console.log(`Deployer: ${deployerAddr}`)

  const balance = await ethers.provider.getBalance(deployerAddr)
  console.log(`Balance: ${ethers.formatEther(balance)} TRX`)

  if (balance < ethers.parseEther('100')) {
    console.warn('⚠️  WARNING: Balance below 100 TRX — deployment may fail due to insufficient gas')
  }

  if (MULTISIG_ADDRESS && !ethers.isAddress(MULTISIG_ADDRESS)) {
    throw new Error(`Invalid MULTISIG_ADDRESS: ${MULTISIG_ADDRESS}`)
  }

  console.log(`Multisig: ${MULTISIG_ADDRESS || '(not set — ownership stays with deployer)'}`)
  console.log(`Initial operator: ${INITIAL_OPERATOR || deployerAddr}`)
  console.log('')

  const record: DeploymentRecord = {
    network: 'tron-mainnet',
    chainId: 728126428, // TRON mainnet
    deployedAt: new Date().toISOString(),
    deployer: deployerAddr,
    contracts: {},
    productIds: [],
  }

  // -----------------------------------------------------------------------
  // 1. AgentRegistry
  // -----------------------------------------------------------------------
  console.log('[1/4] Deploying AgentRegistry...')
  const AgentRegistry = await ethers.getContractFactory('AgentRegistry')
  const agentRegistry = await AgentRegistry.deploy()
  await agentRegistry.waitForDeployment()
  const agentRegistryAddr = await agentRegistry.getAddress()
  record.contracts.AgentRegistry = agentRegistryAddr
  console.log(`  ✓ AgentRegistry: ${agentRegistryAddr}`)

  // -----------------------------------------------------------------------
  // 2. RevenueSplitter
  // -----------------------------------------------------------------------
  console.log('[2/4] Deploying RevenueSplitter...')
  const RevenueSplitter = await ethers.getContractFactory('RevenueSplitter')
  const revenueSplitter = await RevenueSplitter.deploy()
  await revenueSplitter.waitForDeployment()
  const revenueSplitterAddr = await revenueSplitter.getAddress()
  record.contracts.RevenueSplitter = revenueSplitterAddr
  console.log(`  ✓ RevenueSplitter: ${revenueSplitterAddr}`)

  // -----------------------------------------------------------------------
  // 3. EscrowService
  // -----------------------------------------------------------------------
  console.log('[3/4] Deploying EscrowService...')
  const EscrowService = await ethers.getContractFactory('EscrowService')
  const escrowService = await EscrowService.deploy()
  await escrowService.waitForDeployment()
  const escrowServiceAddr = await escrowService.getAddress()
  record.contracts.EscrowService = escrowServiceAddr
  console.log(`  ✓ EscrowService: ${escrowServiceAddr}`)

  // -----------------------------------------------------------------------
  // 4. MicroPaymentChannel
  // -----------------------------------------------------------------------
  console.log('[4/4] Deploying MicroPaymentChannel...')
  const MicroPaymentChannel = await ethers.getContractFactory('MicroPaymentChannel')
  const microPayment = await MicroPaymentChannel.deploy()
  await microPayment.waitForDeployment()
  const microPaymentAddr = await microPayment.getAddress()
  record.contracts.MicroPaymentChannel = microPaymentAddr
  console.log(`  ✓ MicroPaymentChannel: ${microPaymentAddr}`)

  // -----------------------------------------------------------------------
  // 合约关联
  // -----------------------------------------------------------------------
  console.log('\n--- Linking contracts ---')

  // EscrowService → RevenueSplitter
  const linkTx = await escrowService.setRevenueSplitter(
    revenueSplitterAddr,
    ethers.encodeBytes32String('a2a-market'),
  )
  await linkTx.wait()
  console.log('  ✓ EscrowService linked to RevenueSplitter')

  // -----------------------------------------------------------------------
  // 注册产品
  // -----------------------------------------------------------------------
  console.log('\n--- Registering products ---')

  const operator = INITIAL_OPERATOR || deployerAddr
  const setOpTx = await revenueSplitter.setOperator(operator, true)
  await setOpTx.wait()

  const products = [
    { id: 'a2a-pay', mode: 1, rate: 100 }, // 1.00% fixed-tier
    { id: 'a2a-market', mode: 1, rate: 150 }, // 1.50% fixed-tier
    { id: 'a2a-lend', mode: 2, rate: 150 }, // 1.50% variable-float
    { id: 'a2a-earn', mode: 2, rate: 100 }, // 1.00% variable-float
    { id: 'a2a-insure', mode: 2, rate: 200 }, // 2.00% variable-float
  ]

  for (const p of products) {
    const pid = ethers.encodeBytes32String(p.id)
    try {
      const [, , , , active] = await revenueSplitter.getProductStats(pid)
      if (active) {
        console.log(`  ⚠ Product ${p.id} already registered — skipping`)
        continue
      }
    } catch {
      // Not registered yet
    }

    if (p.mode === 1) {
      const tiers = [
        { monthlyVolumeUSD: 0, rate: p.rate },
        { monthlyVolumeUSD: 10000, rate: Math.floor(p.rate * 0.8) },
        { monthlyVolumeUSD: 100000, rate: Math.floor(p.rate * 0.5) },
      ]
      const tx = await revenueSplitter.registerProduct(
        pid,
        p.mode,
        p.rate,
        tiers,
        Math.floor(p.rate * 0.2),
        Math.floor(p.rate * 0.05),
      )
      await tx.wait()
    } else {
      const tx = await revenueSplitter.registerProduct(
        pid,
        p.mode,
        p.rate,
        [],
        Math.floor(p.rate * 0.2),
        Math.floor(p.rate * 0.05),
      )
      await tx.wait()
    }
    record.productIds.push(p)
    console.log(
      `  ✓ Product ${p.id} registered (mode=${p.mode}, rate=${(p.rate / 100).toFixed(2)}%)`,
    )
  }

  // -----------------------------------------------------------------------
  // Ownership 转移至多签 (如果配置了)
  // -----------------------------------------------------------------------
  if (MULTISIG_ADDRESS) {
    console.log(`\n--- Transferring ownership to multisig: ${MULTISIG_ADDRESS} ---`)

    for (const [name, addr] of Object.entries(record.contracts)) {
      try {
        const contract = await ethers.getContractAt(name, addr)
        if (typeof (contract as any).transferOwnership === 'function') {
          const tx = await (contract as any).transferOwnership(MULTISIG_ADDRESS)
          await tx.wait()
          console.log(`  ✓ ${name} ownership → multisig`)
        } else {
          console.log(`  ⚠ ${name} has no transferOwnership method — skipping`)
        }
      } catch (e: any) {
        console.warn(`  ✗ ${name} ownership transfer failed: ${e.message}`)
      }
    }
  }

  // -----------------------------------------------------------------------
  // 保存部署记录
  // -----------------------------------------------------------------------
  const deploymentsDir = path.join(__dirname, '..', 'deployments')
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true })
  }
  const recordPath = path.join(deploymentsDir, 'mainnet.json')
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2))
  console.log(`\n  Deploy record saved to: ${recordPath}`)

  // -----------------------------------------------------------------------
  // 输出 .env 片段
  // -----------------------------------------------------------------------
  console.log('\n' + '='.repeat(60))
  console.log('  .env 配置片段 (追加到项目根目录 .env)')
  console.log('='.repeat(60))
  console.log(`CONTRACT_AGENT_REGISTRY=${agentRegistryAddr}`)
  console.log(`CONTRACT_REVENUE_SPLITTER=${revenueSplitterAddr}`)
  console.log(`CONTRACT_ESCROW_SERVICE=${escrowServiceAddr}`)
  console.log(`CONTRACT_MICRO_PAYMENT=${microPaymentAddr}`)
  console.log('='.repeat(60))
  console.log('\n✓ Mainnet deployment complete!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Deployment failed:', error)
    process.exit(1)
  })
