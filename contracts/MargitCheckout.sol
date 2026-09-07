// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Buyer-bound checkout quotes authorized by Margit's backend.
/// @dev Does not guarantee GitHub delivery or provide escrow/refunds.
contract MargitCheckout {
    struct Order {
        bytes32 orderId;
        bytes32 listingId;
        bytes32 termsHash;
        address buyer;
        address seller;
        address token;
        uint256 amount;
        uint256 deadline;
    }
    address public immutable quoteSigner;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant ORDER_TYPEHASH = keccak256("Order(bytes32 orderId,bytes32 listingId,bytes32 termsHash,address buyer,address seller,address token,uint256 amount,uint256 deadline)");
    mapping(address => bool) public allowedToken;
    mapping(bytes32 => bool) public usedOrders;
    bool private entered;
    event PurchaseCompleted(bytes32 indexed purchaseId, bytes32 indexed listingId, address indexed buyer, address seller, address token, uint256 amount, bytes32 termsHash);

    constructor(address usdc, address eurc, address signer) {
        require(usdc != address(0) && eurc != address(0) && signer != address(0), "Invalid configuration");
        quoteSigner = signer;
        allowedToken[usdc] = true;
        allowedToken[eurc] = true;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("MargitCheckout"), keccak256("1"), block.chainid, address(this)
        ));
    }
    function buy(Order calldata order, uint8 v, bytes32 r, bytes32 s) external returns (bytes32 purchaseId) {
        require(!entered, "Reentrancy");
        entered = true;
        require(msg.sender == order.buyer, "Wrong buyer");
        require(order.deadline >= block.timestamp, "Order expired");
        require(!usedOrders[order.orderId], "Order used");
        require(order.seller != address(0) && order.amount > 0 && allowedToken[order.token], "Invalid order");
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0, "Invalid signature");
        require(v == 27 || v == 28, "Invalid signature");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(ORDER_TYPEHASH, order))));
        require(ecrecover(digest, v, r, s) == quoteSigner, "Invalid signer");
        usedOrders[order.orderId] = true;
        require(IERC20(order.token).transferFrom(msg.sender, order.seller, order.amount), "Transfer failed");
        emit PurchaseCompleted(order.orderId, order.listingId, order.buyer, order.seller, order.token, order.amount, order.termsHash);
        entered = false;
        return order.orderId;
    }
}
