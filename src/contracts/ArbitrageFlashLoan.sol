// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/SafeERC20.sol";

/**
 * @title ArbitrageFlashLoan
 * @notice Multi-DEX arbitrage contract using Aave V3 flash loans
 * @dev EDUCATIONAL PURPOSE ONLY - DO NOT USE WITH REAL FUNDS
 */
contract ArbitrageFlashLoan is FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    struct SwapParams {
        uint8 dexId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOutMin;
        uint256 deadline;
    }

    struct DexConfig {
        address router;
        uint8 dexType; // 0 = UniswapV2, 1 = UniswapV3
    }

    // Events
    event ArbitrageExecuted(
        address indexed asset,
        uint256 amount,
        uint256 profit,
        uint256 gasUsed
    );

    event DexConfigUpdated(uint8 indexed dexId, address router, uint8 dexType);

    // State variables
    address public owner;
    mapping(uint8 => DexConfig) public dexConfigs;
    mapping(address => bool) public authorizedCallers;

    // DEX router interfaces
    interface IUniswapV2Router {
        function swapExactTokensForTokens(
            uint amountIn,
            uint amountOutMin,
            address[] calldata path,
            address to,
            uint deadline
        ) external returns (uint[] memory amounts);

        function getAmountsOut(uint amountIn, address[] calldata path)
            external view returns (uint[] memory amounts);
    }

    interface IUniswapV3Router {
        struct ExactInputSingleParams {
            address tokenIn;
            address tokenOut;
            uint24 fee;
            address recipient;
            uint256 deadline;
            uint256 amountIn;
            uint256 amountOutMinimum;
            uint160 sqrtPriceLimitX96;
        }

        function exactInputSingle(ExactInputSingleParams calldata params)
            external payable returns (uint256 amountOut);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor(address _addressProvider) 
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) 
    {
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
        
        // Initialize DEX configurations for BSC
        _initializeDexConfigs();
    }

    /**
     * @notice Initialize DEX router configurations
     */
    function _initializeDexConfigs() internal {
        // PancakeSwap V2
        dexConfigs[0] = DexConfig({
            router: 0x10ED43C718714eb63d5aA57B78B54704E256024E,
            dexType: 0
        });

        // PancakeSwap V3
        dexConfigs[1] = DexConfig({
            router: 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4,
            dexType: 1
        });

        // Biswap
        dexConfigs[2] = DexConfig({
            router: 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8,
            dexType: 0
        });

        // MDEX
        dexConfigs[3] = DexConfig({
            router: 0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8,
            dexType: 0
        });

        // Uniswap V3 (BSC)
        dexConfigs[4] = DexConfig({
            router: 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45,
            dexType: 1
        });

        // ApeSwap
        dexConfigs[5] = DexConfig({
            router: 0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7,
            dexType: 0
        });
    }

    /**
     * @notice Execute arbitrage with flash loan
     * @param asset The asset to borrow
     * @param amount The amount to borrow
     * @param params Encoded swap parameters
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyAuthorized {
        bytes memory data = abi.encode(params, msg.sender);
        
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            data,
            0 // referralCode
        );
    }

    /**
     * @notice Called by Aave when flash loan is executed
     * @param asset The asset that was borrowed
     * @param amount The amount that was borrowed
     * @param premium The fee that must be paid
     * @param initiator The address that initiated the flash loan
     * @param params The encoded parameters passed from executeArbitrage
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Caller is not the Aave pool");
        require(initiator == address(this), "Initiator is not this contract");

        // Decode parameters
        (bytes memory swapData, address caller) = abi.decode(params, (bytes, address));
        SwapParams[] memory swaps = abi.decode(swapData, (SwapParams[]));

        uint256 initialBalance = IERC20(asset).balanceOf(address(this));
        uint256 currentAmount = amount;
        address currentToken = asset;

        // Execute all swaps in the arbitrage path
        for (uint256 i = 0; i < swaps.length; i++) {
            currentAmount = _executeSwap(swaps[i], currentAmount, currentToken);
            currentToken = swaps[i].tokenOut;
        }

        // Calculate profit (should be back to original asset)
        require(currentToken == asset, "Path did not return to original asset");
        
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 totalRepayment = amount + premium;
        
        require(finalBalance >= totalRepayment, "Insufficient profit to repay loan");

        // Calculate and transfer profit to caller
        uint256 profit = finalBalance - totalRepayment;
        if (profit > 0) {
            IERC20(asset).safeTransfer(caller, profit);
        }

        emit ArbitrageExecuted(asset, amount, profit, gasleft());

        // Approve the Pool to pull the debt + premium
        IERC20(asset).safeApprove(address(POOL), totalRepayment);

        return true;
    }

    /**
     * @notice Execute a single swap on specified DEX
     */
    function _executeSwap(
        SwapParams memory swap,
        uint256 amountIn,
        address tokenIn
    ) internal returns (uint256 amountOut) {
        require(swap.tokenIn == tokenIn, "Token mismatch");
        
        DexConfig memory config = dexConfigs[swap.dexId];
        require(config.router != address(0), "DEX not configured");

        // Approve token spend
        IERC20(tokenIn).safeApprove(config.router, amountIn);

        if (config.dexType == 0) {
            // UniswapV2 style swap
            amountOut = _swapV2(config.router, swap, amountIn);
        } else if (config.dexType == 1) {
            // UniswapV3 style swap
            amountOut = _swapV3(config.router, swap, amountIn);
        }

        require(amountOut >= swap.amountOutMin, "Insufficient output amount");
    }

    /**
     * @notice Execute UniswapV2 style swap
     */
    function _swapV2(
        address router,
        SwapParams memory swap,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        address[] memory path = new address[](2);
        path[0] = swap.tokenIn;
        path[1] = swap.tokenOut;

        uint[] memory amounts = IUniswapV2Router(router).swapExactTokensForTokens(
            amountIn,
            swap.amountOutMin,
            path,
            address(this),
            swap.deadline
        );

        return amounts[1];
    }

    /**
     * @notice Execute UniswapV3 style swap
     */
    function _swapV3(
        address router,
        SwapParams memory swap,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        IUniswapV3Router.ExactInputSingleParams memory params = 
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: swap.tokenIn,
                tokenOut: swap.tokenOut,
                fee: 3000, // 0.3% fee tier
                recipient: address(this),
                deadline: swap.deadline,
                amountIn: amountIn,
                amountOutMinimum: swap.amountOutMin,
                sqrtPriceLimitX96: 0
            });

        return IUniswapV3Router(router).exactInputSingle(params);
    }

    /**
     * @notice Update DEX configuration
     */
    function setDexConfig(
        uint8 dexId,
        address router,
        uint8 dexType
    ) external onlyOwner {
        dexConfigs[dexId] = DexConfig({
            router: router,
            dexType: dexType
        });

        emit DexConfigUpdated(dexId, router, dexType);
    }

    /**
     * @notice Add or remove authorized caller
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    /**
     * @notice Emergency withdrawal function
     */
    function emergencyWithdraw(address token) external onlyOwner {
        if (token == address(0)) {
            payable(owner).transfer(address(this).balance);
        } else {
            IERC20(token).safeTransfer(owner, IERC20(token).balanceOf(address(this)));
        }
    }

    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
        authorizedCallers[newOwner] = true;
    }

    /**
     * @notice Get DEX configuration
     */
    function getDexConfig(uint8 dexId) external view returns (address router, uint8 dexType) {
        DexConfig memory config = dexConfigs[dexId];
        return (config.router, config.dexType);
    }

    receive() external payable {}
}