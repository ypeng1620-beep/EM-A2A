// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title RevenueSplitter
 * @notice EM-A2A 双模式抽成引擎
 *
 * 模式 A (FIXED_TIER)  : 固定级差 — 月流水达标自动降费
 * 模式 B (VARIABLE_FLOAT): 可变浮动 — 基础费率 × 风险 × 信用 × 类型
 */
contract RevenueSplitter is Ownable, ReentrancyGuard, Pausable {
    constructor() Ownable(msg.sender) {}

    // =========================================================================
    // 枚举
    // =========================================================================
    enum Mode { NONE, FIXED_TIER, VARIABLE_FLOAT }

    // =========================================================================
    // 产品配置
    // =========================================================================
    struct TierRule {
        uint256 monthlyVolumeUSD;  // 月流水阈值
        uint256 rate;              // 费率 (基点, 100 = 1%)
    }

    struct ProductConfig {
        bytes32 productId;
        Mode mode;
        // 固定级差配置
        TierRule[] tiers;
        // 可变浮动配置
        uint256 baseRate;          // 基点
        uint256 minRate;
        uint256 maxRate;
        // 通用
        uint256 monthlyVolume;     // 当月累计流水
        uint256 lastResetTime;
        uint256 totalFees;
        bool active;
    }

    // =========================================================================
    // 事件
    // =========================================================================
    event ProductRegistered(bytes32 indexed productId, Mode mode, uint256 baseRate);
    event TransactionExecuted(
        bytes32 indexed productId,
        bytes32 indexed agentId,
        address from,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 rate
    );
    event FeesWithdrawn(bytes32 indexed productId, uint256 amount, address to);
    event TierUpdated(bytes32 indexed productId, uint256 volume, uint256 rate);

    // =========================================================================
    // 存储
    // =========================================================================
    mapping(bytes32 => ProductConfig) public products;
    mapping(bytes32 => uint256) public agentRiskScores;   // 0-100
    mapping(bytes32 => uint256) public agentCreditScores; // 300-950

    // 月度重置
    uint256 public constant MONTH = 30 days;

    // =========================================================================
    // 权限
    // =========================================================================
    mapping(address => bool) public operators;

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    function setOperator(address op, bool status) external onlyOwner {
        operators[op] = status;
    }

    // =========================================================================
    // 产品管理
    // =========================================================================

    function registerProduct(
        bytes32 productId,
        Mode mode,
        uint256 baseRate,
        TierRule[] calldata tiers,
        uint256 minRate,
        uint256 maxRate
    ) external onlyOperator {
        require(products[productId].productId == 0, "Product exists");

        ProductConfig storage config = products[productId];
        config.productId = productId;
        config.mode = mode;
        config.baseRate = baseRate;
        config.minRate = minRate;
        config.maxRate = maxRate;
        config.lastResetTime = block.timestamp;
        config.active = true;

        for (uint256 i = 0; i < tiers.length; i++) {
            config.tiers.push(tiers[i]);
        }

        emit ProductRegistered(productId, mode, baseRate);
    }

    function setTierRate(bytes32 productId, uint256 volume, uint256 rate) external onlyOperator {
        ProductConfig storage config = products[productId];
        require(config.active, "Product inactive");
        require(config.mode == Mode.FIXED_TIER, "Wrong mode");

        config.tiers.push(TierRule(volume, rate));
        emit TierUpdated(productId, volume, rate);
    }

    // =========================================================================
    // 抽成计算
    // =========================================================================

    function calculateFee(
        bytes32 productId,
        bytes32 agentId,
        uint256 amount
    ) public view returns (uint256 fee, uint256 rate) {
        ProductConfig storage config = products[productId];
        require(config.active, "Product inactive");

        if (config.mode == Mode.FIXED_TIER) {
            rate = _getTierRate(config);
        } else {
            uint256 risk = agentRiskScores[agentId];
            uint256 credit = agentCreditScores[agentId];
            rate = _calculateVariableRate(config, risk, credit);
        }

        fee = (amount * rate) / 10000;
        return (fee, rate);
    }

    function _getTierRate(ProductConfig storage config) internal view returns (uint256) {
        uint256 rate = config.tiers.length > 0 ? config.tiers[0].rate : config.baseRate;
        uint256 effectiveVolume = config.monthlyVolume;

        if (block.timestamp > config.lastResetTime + MONTH) {
            effectiveVolume = 0; // 月度已重置
        }

        for (uint256 i = 0; i < config.tiers.length; i++) {
            if (effectiveVolume >= config.tiers[i].monthlyVolumeUSD) {
                rate = config.tiers[i].rate;
            }
        }
        return rate;
    }

    function _calculateVariableRate(
        ProductConfig storage config,
        uint256 riskScore,
        uint256 creditScore
    ) internal view returns (uint256) {
        uint256 riskFactor = 50 + (riskScore * 250) / 100;
        // creditFactor: 150 → 30 (min→max, 高信用低因子)
        uint256 creditScoreAdj = creditScore < 300 ? 300 : (creditScore > 950 ? 950 : creditScore);
        uint256 creditFactor = 150 - ((creditScoreAdj - 300) * 120) / 650;

        uint256 rate = (config.baseRate * riskFactor * creditFactor) / 10000;

        if (rate < config.minRate) rate = config.minRate;
        if (rate > config.maxRate) rate = config.maxRate;

        return rate;
    }

    // =========================================================================
    // 交易执行
    // =========================================================================

    function executeTransaction(
        bytes32 productId,
        bytes32 agentId,
        address to,
        uint256 amount
    ) external payable nonReentrant whenNotPaused returns (uint256 fee, uint256 rate) {
        ProductConfig storage config = products[productId];
        require(config.active, "Product inactive");

        (fee, rate) = calculateFee(productId, agentId, amount);

        uint256 netAmount = amount - fee;

        // 重置月度流水
        if (block.timestamp > config.lastResetTime + MONTH) {
            config.monthlyVolume = 0;
            config.lastResetTime = block.timestamp;
        }

        config.monthlyVolume += amount;
        config.totalFees += fee;

        // 转账
        if (netAmount > 0) {
            (bool sent,) = to.call{value: netAmount}("");
            require(sent, "Transfer failed");
        }

        emit TransactionExecuted(productId, agentId, msg.sender, to, amount, fee, rate);
        return (fee, rate);
    }

    // =========================================================================
    // 风险/信用
    // =========================================================================

    function setAgentRiskScore(bytes32 agentId, uint256 score) external onlyOperator {
        require(score <= 100, "Invalid score");
        agentRiskScores[agentId] = score;
    }

    function setAgentCreditScore(bytes32 agentId, uint256 score) external onlyOperator {
        require(score >= 300 && score <= 950, "Invalid score");
        agentCreditScores[agentId] = score;
    }

    // =========================================================================
    // 提现
    // =========================================================================

    function withdrawFees(bytes32 productId, address to) external onlyOperator nonReentrant {
        ProductConfig storage config = products[productId];
        uint256 amount = config.totalFees;
        require(amount > 0, "No fees");

        config.totalFees = 0;

        (bool sent,) = to.call{value: amount}("");
        require(sent, "Withdrawal failed");

        emit FeesWithdrawn(productId, amount, to);
    }

    // =========================================================================
    // 查询
    // =========================================================================

    function getProductStats(bytes32 productId)
        external
        view
        returns (
            Mode mode,
            uint256 baseRate,
            uint256 monthlyVolume,
            uint256 totalFees,
            bool active
        )
    {
        ProductConfig storage config = products[productId];
        return (config.mode, config.baseRate, config.monthlyVolume, config.totalFees, config.active);
    }

    // =========================================================================
    // 安全
    // =========================================================================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
