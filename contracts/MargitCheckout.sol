// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    )
        external
        returns (bool);
}

contract MargitCheckout {

    error Unauthorized();
    error InvalidAdmin();
    error InvalidToken();
    error InvalidConfiguration();
    error Reentrancy();
    error WrongBuyer();
    error OrderExpired();
    error OrderUsed();
    error InvalidOrder();
    error InvalidSignature();
    error InvalidSigner();
    error TransferFailed();
    error InvalidNativeValue();

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
    address public admin;
    address public pendingAdmin;

    address public immutable nativeUsdc;
    address public immutable quoteSigner;
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant ORDER_TYPEHASH = keccak256("Order(bytes32 orderId,bytes32 listingId,bytes32 termsHash,address buyer,address seller,address token,uint256 amount,uint256 deadline)");

    mapping(address => bool) public allowedToken;
    mapping(bytes32 => bool) public usedOrders;

    bool private entered;

    event AdminTransferStarted(
        address indexed currentAdmin,
        address indexed pendingAdmin
    );

    event AdminTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    event TokenAllowed(
        address indexed token,
        bool allowed
    );

    event PurchaseCompleted(
        bytes32 indexed purchaseId,
        bytes32 indexed listingId,
        address indexed buyer,
        address seller,
        address token,
        uint256 amount,
        bytes32 termsHash
    );

    constructor(
        address _usdc,
        address _eurc,
        address _signer
    ) {
        if (_usdc == address(0)) {
            revert InvalidConfiguration();
        }

        if (_eurc == address(0)) {
            revert InvalidConfiguration();
        }

        if (_usdc == _eurc) {
            revert InvalidConfiguration();
        }

        if (_signer == address(0)) {
            revert InvalidConfiguration();
        }

        admin = msg.sender;

        emit AdminTransferred(
            address(0),
            msg.sender
        );

        nativeUsdc = _usdc;
        quoteSigner = _signer;
        allowedToken[_usdc] = true;
        allowedToken[_eurc] = true;

        emit TokenAllowed(
            _usdc,
            true
        );

        emit TokenAllowed(
            _eurc,
            true
        );

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("MargitCheckout"), keccak256("1"), block.chainid, address(this)
        ));
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert Unauthorized();
        }
        _;
    }

    function setAllowedToken(
        address _token,
        bool _allowed
    )
        external
        onlyAdmin
    {
        if (_token == address(0)) {
            revert InvalidToken();
        }

        if (_allowed && _token.code.length == 0) {
            revert InvalidToken();
        }

        allowedToken[_token] = _allowed;

        emit TokenAllowed(
            _token,
            _allowed
        );
    }

    function transferAdmin(
        address _newAdmin
    )
        external
        onlyAdmin
    {
        if (_newAdmin == address(0)) {
            revert InvalidAdmin();
        }

        if (_newAdmin == admin) {
            revert InvalidAdmin();
        }

        pendingAdmin = _newAdmin;

        emit AdminTransferStarted(
            admin,
            _newAdmin
        );
    }

    function cancelAdminTransfer()
        external
        onlyAdmin
    {
        pendingAdmin = address(0);

        emit AdminTransferStarted(
            admin,
            address(0)
        );
    }

    function acceptAdmin()
        external
    {
        if (msg.sender != pendingAdmin) {
            revert Unauthorized();
        }

        address previousAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);

        emit AdminTransferred(
            previousAdmin,
            msg.sender
        );
    }

    function buy(
        Order calldata _order,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        external
        payable
        returns (bytes32 purchaseId)
    {
        if (entered) {
            revert Reentrancy();
        }

        entered = true;

        if (msg.sender != _order.buyer) {
            revert WrongBuyer();
        }

        if (_order.deadline < block.timestamp) {
            revert OrderExpired();
        }

        if (usedOrders[_order.orderId]) {
            revert OrderUsed();
        }

        if (_order.seller == address(0)) {
            revert InvalidOrder();
        }

        if (_order.amount == 0) {
            revert InvalidOrder();
        }

        if (allowedToken[_order.token] == false) {
            revert InvalidOrder();
        }

        if (uint256(_s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) {
            revert InvalidSignature();
        }

        if (_v != 27 && _v != 28) {
            revert InvalidSignature();
        }

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        ORDER_TYPEHASH,
                        _order
                    )
                )
            )
        );

        if (ecrecover(digest, _v, _r, _s) != quoteSigner) {
            revert InvalidSigner();
        }

        usedOrders[_order.orderId] = true;

        if (_order.token == nativeUsdc) {

            // Quotes and receipt events use six decimals; native USDC uses eighteen.
            if (_order.amount > type(uint256).max / 1e12 || msg.value != _order.amount * 1e12) {
                revert InvalidNativeValue();
            }

            (bool success,) = payable(_order.seller).call{
                value: msg.value
            }("");

            if (success == false) {
                revert TransferFailed();
            }

        } else {

            if (msg.value != 0) {
                revert InvalidNativeValue();
            }

            if (IERC20(_order.token).transferFrom(
                msg.sender,
                _order.seller,
                _order.amount
            ) == false) {
                revert TransferFailed();
            }
        }

        emit PurchaseCompleted(
            _order.orderId,
            _order.listingId,
            _order.buyer,
            _order.seller,
            _order.token,
            _order.amount,
            _order.termsHash
        );

        entered = false;
        return _order.orderId;
    }
}
