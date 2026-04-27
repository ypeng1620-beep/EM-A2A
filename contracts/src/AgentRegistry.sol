// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentRegistry
 * @notice Agent DID 注册表 — 链上 Agent 身份注册 + 元数据管理
 */
contract AgentRegistry is Ownable {
    constructor() Ownable(msg.sender) {}

    // =========================================================================
    // 结构
    // =========================================================================

    struct AgentRecord {
        string did;
        address owner;
        string metadata;
        uint256 registeredAt;
        bool active;
    }

    struct CredentialRecord {
        string credentialId;
        string holderDID;
        string credentialType;
        string metadata;
        uint256 issuedAt;
        uint256 expiresAt;
        bool active;
    }

    // =========================================================================
    // 事件
    // =========================================================================
    event AgentRegistered(string indexed did, address indexed owner);
    event MetadataUpdated(string indexed did);
    event CredentialIssued(string indexed credentialId, string indexed holderDID, string credentialType);
    event CredentialRevoked(string indexed credentialId);

    // =========================================================================
    // 存储
    // =========================================================================
    mapping(string => AgentRecord) public agents;           // DID → Agent
    mapping(address => string) public addressToDID;        // Address → DID
    mapping(string => CredentialRecord) public credentials; // CredentialID → Credential

    uint256 public agentCount;
    uint256 public credentialCount;

    // =========================================================================
    // Agent 注册
    // =========================================================================

    function registerAgent(string calldata did, string calldata metadata) external {
        require(bytes(did).length > 0, "DID required");
        require(agents[did].owner == address(0), "DID exists");
        require(bytes(addressToDID[msg.sender]).length == 0, "Address has DID");

        agents[did] = AgentRecord({
            did: did,
            owner: msg.sender,
            metadata: metadata,
            registeredAt: block.timestamp,
            active: true
        });

        addressToDID[msg.sender] = did;
        agentCount++;

        emit AgentRegistered(did, msg.sender);
    }

    function updateMetadata(string calldata did, string calldata metadata) external {
        AgentRecord storage agent = agents[did];
        require(agent.owner == msg.sender || msg.sender == owner(), "Not authorized");
        require(agent.active, "Inactive");

        agent.metadata = metadata;
        emit MetadataUpdated(did);
    }

    function setAgentStatus(string calldata did, bool active) external onlyOwner {
        agents[did].active = active;
    }

    // =========================================================================
    // 凭证管理
    // =========================================================================

    function issueCredential(
        string calldata credentialId,
        string calldata holderDID,
        string calldata credentialType,
        string calldata metadata,
        uint256 expiresAt
    ) external onlyOwner {
        require(agents[holderDID].active, "Agent inactive");
        require(!credentials[credentialId].active, "Credential exists");

        credentials[credentialId] = CredentialRecord({
            credentialId: credentialId,
            holderDID: holderDID,
            credentialType: credentialType,
            metadata: metadata,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            active: true
        });

        credentialCount++;
        emit CredentialIssued(credentialId, holderDID, credentialType);
    }

    function revokeCredential(string calldata credentialId) external onlyOwner {
        CredentialRecord storage cred = credentials[credentialId];
        require(cred.active, "Not active");
        cred.active = false;
        emit CredentialRevoked(credentialId);
    }

    // =========================================================================
    // 查询
    // =========================================================================

    function resolveDID(string calldata did) external view returns (
        address owner,
        string memory metadata,
        uint256 registeredAt,
        bool active
    ) {
        AgentRecord storage agent = agents[did];
        return (agent.owner, agent.metadata, agent.registeredAt, agent.active);
    }

    function getDID(address addr) external view returns (string memory) {
        return addressToDID[addr];
    }

    function getCredential(string calldata credentialId) external view returns (
        string memory holderDID,
        string memory credentialType,
        string memory metadata,
        uint256 issuedAt,
        uint256 expiresAt,
        bool active
    ) {
        CredentialRecord storage cred = credentials[credentialId];
        return (cred.holderDID, cred.credentialType, cred.metadata, cred.issuedAt, cred.expiresAt, cred.active);
    }
}
