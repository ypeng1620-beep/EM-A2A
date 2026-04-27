import { expect } from "chai"
import { ethers } from "hardhat"
import type { AgentRegistry } from "../typechain-types"

describe("AgentRegistry", () => {
  let registry: AgentRegistry
  let owner: ReturnType<typeof ethers.Wallet> extends Promise<infer T> ? T : never
  let agent1: any
  let agent2: any

  beforeEach(async () => {
    ;[owner, agent1, agent2] = await ethers.getSigners()
    const factory = await ethers.getContractFactory("AgentRegistry")
    registry = await factory.deploy()
  })

  describe("Registration", () => {
    it("should register a new agent with DID", async () => {
      const did = "did:bai:tron:TABC123"
      const metadata = JSON.stringify({ name: "Test Agent", category: ["coding"] })

      const tx = await registry.connect(agent1).registerAgent(did, metadata)
      const receipt = await tx.wait()

      expect(receipt).to.not.be.null
    })

    it("should emit AgentRegistered event", async () => {
      const did = "did:bai:tron:TABC456"
      const metadata = JSON.stringify({ name: "Event Agent" })

      await expect(
        registry.connect(agent1).registerAgent(did, metadata)
      ).to.emit(registry, "AgentRegistered")
        .withArgs(did, agent1.address)
    })

    it("should reject empty DID", async () => {
      await expect(
        registry.connect(agent1).registerAgent("", "{}")
      ).to.be.revertedWith("DID required")
    })

    it("should reject duplicate DID", async () => {
      const did = "did:bai:tron:TDUP"
      await registry.connect(agent1).registerAgent(did, "{}")
      await expect(
        registry.connect(agent2).registerAgent(did, "{}")
      ).to.be.revertedWith("DID exists")
    })

    it("should reject address registering twice", async () => {
      const did1 = "did:bai:tron:TFIRST"
      const did2 = "did:bai:tron:TSECOND"
      await registry.connect(agent1).registerAgent(did1, "{}")
      await expect(
        registry.connect(agent1).registerAgent(did2, "{}")
      ).to.be.revertedWith("Address has DID")
    })

    it("should increment agentCount", async () => {
      expect(await registry.agentCount()).to.equal(0)
      await registry.connect(agent1).registerAgent("did:bai:tron:TA", "{}")
      expect(await registry.agentCount()).to.equal(1)
      await registry.connect(agent2).registerAgent("did:bai:tron:TB", "{}")
      expect(await registry.agentCount()).to.equal(2)
    })
  })

  describe("Resolution", () => {
    it("should resolve registered DID", async () => {
      const did = "did:bai:tron:TRESOLVE"
      const metadata = JSON.stringify({ name: "Resolve Me" })
      await registry.connect(agent1).registerAgent(did, metadata)

      const [ownerAddr, meta, registeredAt, active] = await registry.resolveDID(did)
      expect(ownerAddr).to.equal(agent1.address)
      expect(meta).to.equal(metadata)
      expect(registeredAt).to.be.gt(0)
      expect(active).to.be.true
    })

    it("should get DID by address", async () => {
      const did = "did:bai:tron:TBYADDR"
      await registry.connect(agent1).registerAgent(did, "{}")
      const result = await registry.getDID(agent1.address)
      expect(result).to.equal(did)
    })
  })

  describe("Metadata", () => {
    it("should allow owner to update metadata", async () => {
      const did = "did:bai:tron:TMETA"
      await registry.connect(agent1).registerAgent(did, "{}")
      const newMeta = JSON.stringify({ name: "Updated" })

      await registry.connect(agent1).updateMetadata(did, newMeta)
      const [, meta] = await registry.resolveDID(did)
      expect(meta).to.equal(newMeta)
    })

    it("should allow contract owner to update any metadata", async () => {
      const did = "did:bai:tron:TOWNERUP"
      await registry.connect(agent1).registerAgent(did, "{}")
      const newMeta = JSON.stringify({ name: "Owner Updated" })

      await registry.connect(owner).updateMetadata(did, newMeta)
      const [, meta] = await registry.resolveDID(did)
      expect(meta).to.equal(newMeta)
    })

    it("should reject unauthorized metadata update", async () => {
      const did = "did:bai:tron:TNOAUTH"
      await registry.connect(agent1).registerAgent(did, "{}")

      await expect(
        registry.connect(agent2).updateMetadata(did, "{}")
      ).to.be.revertedWith("Not authorized")
    })
  })

  describe("Status", () => {
    it("should allow owner to deactivate agent", async () => {
      const did = "did:bai:tron:TDEACTIVATE"
      await registry.connect(agent1).registerAgent(did, "{}")

      await registry.connect(owner).setAgentStatus(did, false)
      const [, , , active] = await registry.resolveDID(did)
      expect(active).to.be.false
    })

    it("should reject non-owner status change", async () => {
      const did = "did:bai:tron:TNOSTATUS"
      await registry.connect(agent1).registerAgent(did, "{}")

      await expect(
        registry.connect(agent1).setAgentStatus(did, false)
      ).to.be.reverted
    })
  })

  describe("Credentials", () => {
    it("should issue a credential", async () => {
      const did = "did:bai:tron:TCRED"
      await registry.connect(agent1).registerAgent(did, "{}")

      const credId = "cred_001"
      const credType = "code_audit"
      const credMeta = JSON.stringify({ level: "senior" })
      const expiresAt = Math.floor(Date.now() / 1000) + 365 * 86400

      await expect(
        registry.connect(owner).issueCredential(credId, did, credType, credMeta, expiresAt)
      ).to.emit(registry, "CredentialIssued")
        .withArgs(credId, did, credType)

      const [holderDID, cType, cMeta, issuedAt, cExpiresAt, active] = await registry.getCredential(credId)
      expect(holderDID).to.equal(did)
      expect(cType).to.equal(credType)
      expect(cMeta).to.equal(credMeta)
      expect(active).to.be.true
    })

    it("should revoke a credential", async () => {
      const did = "did:bai:tron:TREVOKE"
      await registry.connect(agent1).registerAgent(did, "{}")

      const credId = "cred_revoke"
      await registry.connect(owner).issueCredential(credId, did, "code_audit", "{}", Date.now() + 365 * 86400)

      await expect(
        registry.connect(owner).revokeCredential(credId)
      ).to.emit(registry, "CredentialRevoked").withArgs(credId)

      const [, , , , , active] = await registry.getCredential(credId)
      expect(active).to.be.false
    })

    it("should reject credential for inactive agent", async () => {
      const did = "did:bai:tron:TINACTIVE"
      await registry.connect(agent1).registerAgent(did, "{}")
      await registry.connect(owner).setAgentStatus(did, false)

      await expect(
        registry.connect(owner).issueCredential("cred_x", did, "code_audit", "{}", Date.now() + 365 * 86400)
      ).to.be.revertedWith("Agent inactive")
    })
  })
})
