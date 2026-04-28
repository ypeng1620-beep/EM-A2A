import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { RevenueSplitter } from '../typechain-types'

describe('RevenueSplitter', () => {
  let splitter: RevenueSplitter
  let owner: any
  let operator: any
  let user: any

  const productId = ethers.encodeBytes32String('a2a-pay')
  const agentId = ethers.encodeBytes32String('agent-001')
  const MODE_FIXED = 1 // Mode.FIXED_TIER
  const MODE_VARIABLE = 2 // Mode.VARIABLE_FLOAT

  beforeEach(async () => {
    ;[owner, operator, user] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('RevenueSplitter')
    splitter = await factory.deploy()
    await splitter.setOperator(operator.address, true)
  })

  describe('Product Registration', () => {
    it('should register a product with fixed tier mode', async () => {
      const tiers = [
        { monthlyVolumeUSD: 0, rate: 100 }, // 1%
        { monthlyVolumeUSD: 10000, rate: 80 }, // 0.8%
      ]
      await splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, tiers, 50, 500)
      const [, baseRate, , , active] = await splitter.getProductStats(productId)
      expect(baseRate).to.equal(100)
      expect(active).to.be.true
    })

    it('should register a product with variable float mode', async () => {
      await splitter.connect(operator).registerProduct(productId, MODE_VARIABLE, 100, [], 20, 500)
      const [, baseRate, , , active] = await splitter.getProductStats(productId)
      expect(baseRate).to.equal(100)
      expect(active).to.be.true
    })

    it('should reject duplicate product registration', async () => {
      await splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, [], 50, 500)
      await expect(
        splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, [], 50, 500),
      ).to.be.revertedWith('Product exists')
    })
  })

  describe('Fixed Tier Fee Calculation', () => {
    beforeEach(async () => {
      const tiers = [
        { monthlyVolumeUSD: 0, rate: 100 },
        { monthlyVolumeUSD: 50000, rate: 50 },
      ]
      await splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, tiers, 50, 500)
    })

    it('should calculate default tier fee', async () => {
      const [fee, rate] = await splitter.calculateFee(productId, agentId, ethers.parseEther('1'))
      expect(rate).to.equal(100)
      expect(fee).to.equal(ethers.parseEther('0.01'))
    })

    it('should return zero fee for zero amount', async () => {
      const [fee, rate] = await splitter.calculateFee(productId, agentId, 0)
      expect(fee).to.equal(0)
      expect(rate).to.equal(100)
    })
  })

  describe('Variable Float Fee Calculation', () => {
    beforeEach(async () => {
      await splitter.connect(operator).registerProduct(productId, MODE_VARIABLE, 100, [], 20, 500)
    })

    it('should calculate fee with risk and credit factors', async () => {
      await splitter.setAgentRiskScore(agentId, 50)
      await splitter.setAgentCreditScore(agentId, 700)

      const [fee, rate] = await splitter.calculateFee(productId, agentId, ethers.parseEther('1'))
      expect(rate).to.be.gt(0)
      expect(rate).to.be.lte(500)
    })

    it('should give lower rate for low risk + high credit', async () => {
      await splitter.setAgentRiskScore(agentId, 10)
      await splitter.setAgentCreditScore(agentId, 900)

      const [fee, rate] = await splitter.calculateFee(productId, agentId, ethers.parseEther('1'))
      expect(rate).to.be.lt(100)
    })

    it('should respect rate bounds', async () => {
      await splitter.setAgentRiskScore(agentId, 100)
      await splitter.setAgentCreditScore(agentId, 300)

      const [, rate] = await splitter.calculateFee(productId, agentId, ethers.parseEther('1'))
      expect(rate).to.be.lte(500)
      expect(rate).to.be.gte(20)
    })
  })

  describe('Transaction Execution', () => {
    beforeEach(async () => {
      await splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, [], 50, 500)
      // Fund contract
      await owner.sendTransaction({ to: splitter.target, value: ethers.parseEther('10') })
    })

    it('should execute a transaction and transfer net amount', async () => {
      const amount = ethers.parseEther('1')
      const tx = await splitter
        .connect(operator)
        .executeTransaction(productId, agentId, user.address, amount)
      await tx.wait()
      const [, , monthlyVolume, totalFees] = await splitter.getProductStats(productId)
      expect(monthlyVolume).to.equal(amount)
      expect(totalFees).to.equal(ethers.parseEther('0.01'))
    })

    it('should accumulate volume and fees', async () => {
      await splitter
        .connect(operator)
        .executeTransaction(productId, agentId, user.address, ethers.parseEther('1'))
      const [, , monthlyVolume, totalFees] = await splitter.getProductStats(productId)
      expect(monthlyVolume).to.equal(ethers.parseEther('1'))
      expect(totalFees).to.equal(ethers.parseEther('0.01'))
    })

    it('should reject paused transactions', async () => {
      await splitter.connect(owner).pause()
      await expect(
        splitter
          .connect(operator)
          .executeTransaction(productId, agentId, user.address, ethers.parseEther('1')),
      ).to.be.reverted
    })
  })

  describe('Withdrawal', () => {
    beforeEach(async () => {
      await splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, [], 50, 500)
      await owner.sendTransaction({ to: splitter.target, value: ethers.parseEther('10') })
      await splitter
        .connect(operator)
        .executeTransaction(productId, agentId, user.address, ethers.parseEther('1'))
    })

    it('should allow fee withdrawal', async () => {
      await splitter.connect(operator).withdrawFees(productId, owner.address)
      const [, , , totalFees] = await splitter.getProductStats(productId)
      expect(totalFees).to.equal(0)
    })
  })

  describe('Pausable', () => {
    it('should allow owner to pause and unpause', async () => {
      await splitter.connect(owner).pause()
      await expect(
        splitter.connect(operator).registerProduct(productId, MODE_FIXED, 100, [], 50, 500),
      ).to.not.be.reverted // registerProduct doesn't have whenNotPaused
      await splitter.connect(owner).unpause()
    })
  })
})
