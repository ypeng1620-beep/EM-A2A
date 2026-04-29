// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EscrowService
 * @notice Agent 服务托管支付 — 买方冻结 → Agent 交付 → 买方验收 → 释放 (含抽成)
 */
contract EscrowService is Ownable, ReentrancyGuard {
    constructor() Ownable(msg.sender) {}

    // =========================================================================
    // 类型
    // =========================================================================
    enum OrderStatus {
        NONE,
        FUNDED,
        DELIVERED,
        ACCEPTED,
        DISPUTED,
        RESOLVED_RELEASED,
        RESOLVED_REFUNDED,
        CANCELLED
    }

    struct Order {
        uint256 id;
        address buyer;
        address seller;
        uint256 amount;
        uint256 fee;
        uint256 feeRate;
        uint256 createdAt;
        uint256 deadline;
        OrderStatus status;
        string metadata;
    }

    // =========================================================================
    // 事件
    // =========================================================================
    event OrderCreated(uint256 indexed orderId, address buyer, address seller, uint256 amount);
    event OrderDelivered(uint256 indexed orderId);
    event OrderAccepted(uint256 indexed orderId);
    event OrderDisputed(uint256 indexed orderId, string reason);
    event OrderResolved(uint256 indexed orderId, OrderStatus resolution);

    // =========================================================================
    // 存储
    // =========================================================================
    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId = 1;
    uint256 public platformFees;

    // 抽成配置
    address public revenueSplitter;
    bytes32 public productId;

    // =========================================================================
    // 配置
    // =========================================================================
    function setRevenueSplitter(address addr, bytes32 pid) external onlyOwner {
        revenueSplitter = addr;
        productId = pid;
    }

    // =========================================================================
    // 订单生命周期
    // =========================================================================

    function createOrder(
        address seller,
        uint256 deadline,
        string calldata metadata
    ) external payable returns (uint256 orderId) {
        require(msg.value > 0, "Amount required");
        require(deadline > block.timestamp, "Deadline in past");

        orderId = nextOrderId++;
        Order storage order = orders[orderId];
        order.id = orderId;
        order.buyer = msg.sender;
        order.seller = seller;
        order.amount = msg.value;
        order.fee = 0;
        order.feeRate = 0;
        order.createdAt = block.timestamp;
        order.deadline = deadline;
        order.status = OrderStatus.FUNDED;
        order.metadata = metadata;

        emit OrderCreated(orderId, msg.sender, seller, msg.value);
    }

    function confirmDelivery(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(msg.sender == order.seller, "Not seller");
        require(order.status == OrderStatus.FUNDED, "Not funded");

        order.status = OrderStatus.DELIVERED;
        emit OrderDelivered(orderId);
    }

    function acceptDelivery(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(msg.sender == order.buyer, "Not buyer");
        require(order.status == OrderStatus.DELIVERED, "Not delivered");

        order.status = OrderStatus.ACCEPTED;
        _releaseFunds(orderId);
        emit OrderAccepted(orderId);
    }

    function dispute(uint256 orderId, string calldata reason) external {
        Order storage order = orders[orderId];
        require(msg.sender == order.buyer, "Only buyer");
        require(
            order.status == OrderStatus.FUNDED || order.status == OrderStatus.DELIVERED,
            "Cannot dispute"
        );

        order.status = OrderStatus.DISPUTED;
        emit OrderDisputed(orderId, reason);
    }

    function resolveDispute(uint256 orderId, bool refund) external onlyOwner {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.DISPUTED, "Not disputed");

        if (refund) {
            order.status = OrderStatus.RESOLVED_REFUNDED;
            (bool sent,) = order.buyer.call{value: order.amount}("");
            require(sent, "Refund failed");
        } else {
            order.status = OrderStatus.RESOLVED_RELEASED;
            _releaseFunds(orderId);
        }

        emit OrderResolved(orderId, order.status);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        require(msg.sender == order.buyer, "Not buyer");
        require(order.status == OrderStatus.FUNDED, "Not funded");

        order.status = OrderStatus.CANCELLED;
        (bool sent,) = order.buyer.call{value: order.amount}("");
        require(sent, "Refund failed");
    }

    // =========================================================================
    // 内部
    // =========================================================================

    function _releaseFunds(uint256 orderId) internal {
        Order storage order = orders[orderId];

        uint256 fee = order.fee;
        if (fee == 0) {
            // 默认抽成
            fee = (order.amount * 150) / 10000; // 1.5%
            order.fee = fee;
            order.feeRate = 150;
        }

        platformFees += fee;

        uint256 toSeller = order.amount - fee;
        if (toSeller > 0) {
            (bool sent,) = order.seller.call{value: toSeller}("");
            require(sent, "Payment failed");
        }
    }

    // =========================================================================
    // 查询
    // =========================================================================

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function getPlatformFees() external view returns (uint256) {
        return platformFees;
    }

    function withdrawFees(address to) external onlyOwner {
        require(platformFees > 0, "No fees");
        uint256 amount = platformFees;
        platformFees = 0;
        (bool sent,) = to.call{value: amount}("");
        require(sent, "Withdrawal failed");
    }
}
