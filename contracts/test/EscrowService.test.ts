import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { EscrowService } from '../typechain-types'

describe('EscrowService', () => {
  let escrow: EscrowService
  let owner: any
  let buyer: any
  let seller: any

  const productId = ethers.encodeBytes32String('a2a-market')

  beforeEach(async () => {
    ;[owner, buyer, seller] = await ethers.getSigners()
    const factory = await ethers.getContractFactory('EscrowService')
    escrow = await factory.deploy()
  })

  describe('Order Creation', () => {
    it('should create a funded order', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      const amount = ethers.parseEther('1')

      await expect(
        escrow.connect(buyer).createOrder(seller.address, deadline, '{}', { value: amount }),
      )
        .to.emit(escrow, 'OrderCreated')
        .withArgs(1, buyer.address, seller.address, amount)

      const order = await escrow.getOrder(1)
      expect(order.buyer).to.equal(buyer.address)
      expect(order.seller).to.equal(seller.address)
      expect(order.amount).to.equal(amount)
      expect(order.status).to.equal(1) // FUNDED
    })

    it('should reject zero amount', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      await expect(
        escrow.connect(buyer).createOrder(seller.address, deadline, '{}'),
      ).to.be.revertedWith('Amount required')
    })

    it('should reject past deadline', async () => {
      const deadline = Math.floor(Date.now() / 1000) - 3600
      await expect(
        escrow
          .connect(buyer)
          .createOrder(seller.address, deadline, '{}', { value: ethers.parseEther('1') }),
      ).to.be.revertedWith('Deadline in past')
    })

    it('should auto-increment order IDs', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      const amount = ethers.parseEther('1')

      await escrow.connect(buyer).createOrder(seller.address, deadline, '{}', { value: amount })
      await escrow.connect(buyer).createOrder(seller.address, deadline, '{}', { value: amount })

      const order1 = await escrow.getOrder(1)
      const order2 = await escrow.getOrder(2)
      expect(order1.id).to.equal(1)
      expect(order2.id).to.equal(2)
    })
  })

  describe('Delivery Flow', () => {
    beforeEach(async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      await escrow
        .connect(buyer)
        .createOrder(seller.address, deadline, '{}', { value: ethers.parseEther('1') })
    })

    it('should allow seller to confirm delivery', async () => {
      await expect(escrow.connect(seller).confirmDelivery(1))
        .to.emit(escrow, 'OrderDelivered')
        .withArgs(1)

      const order = await escrow.getOrder(1)
      expect(order.status).to.equal(2) // DELIVERED
    })

    it('should reject non-seller delivery confirmation', async () => {
      await expect(escrow.connect(buyer).confirmDelivery(1)).to.be.revertedWith('Not seller')
    })

    it('should allow buyer to accept delivery and release funds', async () => {
      await escrow.connect(seller).confirmDelivery(1)
      const initialSellerBalance = await ethers.provider.getBalance(seller.address)

      await expect(escrow.connect(buyer).acceptDelivery(1))
        .to.emit(escrow, 'OrderAccepted')
        .withArgs(1)

      const order = await escrow.getOrder(1)
      expect(order.status).to.equal(3) // ACCEPTED
    })

    it('should reject non-buyer acceptance', async () => {
      await escrow.connect(seller).confirmDelivery(1)
      await expect(escrow.connect(seller).acceptDelivery(1)).to.be.revertedWith('Not buyer')
    })

    it('should reject acceptance without delivery', async () => {
      await expect(escrow.connect(buyer).acceptDelivery(1)).to.be.revertedWith('Not delivered')
    })
  })

  describe('Disputes', () => {
    beforeEach(async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      await escrow
        .connect(buyer)
        .createOrder(seller.address, deadline, '{}', { value: ethers.parseEther('1') })
    })

    it('should allow buyer to dispute', async () => {
      await expect(escrow.connect(buyer).dispute(1, 'Not as described'))
        .to.emit(escrow, 'OrderDisputed')
        .withArgs(1, 'Not as described')

      const order = await escrow.getOrder(1)
      expect(order.status).to.equal(4) // DISPUTED
    })

    it('should allow owner to resolve dispute with refund', async () => {
      await escrow.connect(buyer).dispute(1, 'Bad quality')
      await expect(escrow.connect(owner).resolveDispute(1, true))
        .to.emit(escrow, 'OrderResolved')
        .withArgs(1, 6) // RESOLVED_REFUNDED
    })

    it('should allow owner to resolve dispute with release', async () => {
      await escrow.connect(buyer).dispute(1, 'Bad quality')
      await expect(escrow.connect(owner).resolveDispute(1, false))
        .to.emit(escrow, 'OrderResolved')
        .withArgs(1, 5) // RESOLVED_RELEASED
    })
  })

  describe('Cancellation', () => {
    it('should allow buyer to cancel funded order', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      await escrow
        .connect(buyer)
        .createOrder(seller.address, deadline, '{}', { value: ethers.parseEther('1') })

      await escrow.connect(buyer).cancelOrder(1)
      const order = await escrow.getOrder(1)
      expect(order.status).to.equal(7) // CANCELLED
    })

    it('should reject non-buyer cancellation', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      await escrow
        .connect(buyer)
        .createOrder(seller.address, deadline, '{}', { value: ethers.parseEther('1') })

      await expect(escrow.connect(seller).cancelOrder(1)).to.be.revertedWith('Not buyer')
    })
  })

  describe('Fee Withdrawal', () => {
    it('should allow owner to withdraw platform fees', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600
      await escrow
        .connect(buyer)
        .createOrder(seller.address, deadline, '{}', { value: ethers.parseEther('1') })
      await escrow.connect(seller).confirmDelivery(1)
      await escrow.connect(buyer).acceptDelivery(1)

      const fees = await escrow.getPlatformFees()
      expect(fees).to.be.gt(0)

      await escrow.connect(owner).withdrawFees(owner.address)
      const remaining = await escrow.getPlatformFees()
      expect(remaining).to.equal(0)
    })
  })
})
