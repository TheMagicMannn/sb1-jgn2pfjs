// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ArbitrageFlashLoan
 * @notice Multi-DEX arbitrage contract using Aave V3 flash loans
 * @dev Production-ready contract with comprehensive security features
 */
contract ArbitrageFlashLoan is 
    FlashLoanSimpleReceiverBase, 
    Ownable, 
    ReentrancyGuard, 
    Pausable 
{
    using SafeERC20 for IERC20;

    struct SwapParams {
        uint8 dexId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOutMin;
        uint256 deadline;
        bytes extraData; // For V3 fee tiers, etc.
    }

    struct DexConfig {
        address router;
        uint8 dexType; // 0 = UniswapV2, 1 = UniswapV3
        bool isActive;
        uint256 maxSlippage; // Basis points (10000 = 100%)
    }

    struct ArbitrageResult {
        uint256 profit;
        uint256 gasUsed;
        uint256 flashLoanFee;
        bool success;
    }

    // Events
    event ArbitrageExecuted(
        address indexed asset,
        uint256 amount,
        uint256 profit,
        uint256 gasUsed,
        address indexed executor
    );

    event DexConfigUpdated(
        uint8 indexed dexId, 
        address router, 
        uint8 dexType, 
        bool isActive
    );

    event ProfitWithdrawn(
        address indexed token,
        uint256 amount,
        address indexed recipient
    );

    event EmergencyWithdrawal(
        address indexed token,
        uint256 amount
    );

    // State variables
    mapping(uint8 => DexConfig) public dexConfigs;
    mapping(address => bool) public authorizedExecutors;
    mapping(address => uint256) public accumulatedProfits;
    
    uint256 public constant MAX_SLIPPAGE = 1000; // 10% max slippage
    uint256 public constant MIN_PROFIT_THRESHOLD = 1e15; // 0.001 ETH minimum profit
    uint256 public totalArbitrages;
    uint256 public totalProfit;

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

    modifier onlyAuthorized() {
        require(
            authorizedExecutors[msg.sender] || msg.sender == owner(),
            "ArbitrageFlashLoan: Not authorized"
        );
        _;
    }

    modifier validDexId(uint8 dexId) {
        require(
            dexConfigs[dexId].router != address(0) && dexConfigs[dexId].isActive,
            "ArbitrageFlashLoan: Invalid or inactive DEX"
        );
        _;
    }

    constructor(address _addressProvider) 
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider))
    {
        _initializeDexConfigs();
        authorizedExecutors[msg.sender] = true;
    }

    /**
     * @notice Initialize DEX router configurations for BSC
     */
    function _initializeDexConfigs() internal {
        // PancakeSwap V2
        dexConfigs[0] = DexConfig({
            router: 0x10ED43C718714eb63d5aA57B78B54704E256024E,
            dexType: 0,
            isActive: true,
            maxSlippage: 300 // 3%
        });

        // PancakeSwap V3
        dexConfigs[1] = DexConfig({
            router: 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4,
            dexType: 1,
            isActive: true,
            maxSlippage: 300 // 3%
        });

        // Biswap
        dexConfigs[2] = DexConfig({
            router: 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8,
            dexType: 0,
            isActive: true,
            maxSlippage: 300 // 3%
        });

        // MDEX
        dexConfigs[3] = DexConfig({
            router: 0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8,
            dexType: 0,
            isActive: true,
            maxSlippage: 300 // 3%
        });

        // Uniswap V3 (BSC)
        dexConfigs[4] = DexConfig({
            router: 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45,
            dexType: 1,
            isActive: true,
            maxSlippage: 300 // 3%
        });

        // ApeSwap
        dexConfigs[5] = DexConfig({
            router: 0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7,
            dexType: 0,
            isActive: true,
            maxSlippage: 300 // 3%
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
    ) external onlyAuthorized whenNotPaused nonReentrant {
        require(amount > 0, "ArbitrageFlashLoan: Amount must be greater than 0");
        
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
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "ArbitrageFlashLoan: Caller is not the Aave pool");
        require(initiator == address(this), "ArbitrageFlashLoan: Initiator is not this contract");

        uint256 gasStart = gasleft();

        // Decode parameters
        (bytes memory swapData, address executor) = abi.decode(params, (bytes, address));
        SwapParams[] memory swaps = abi.decode(swapData, (SwapParams[]));

        require(swaps.length > 0, "ArbitrageFlashLoan: No swaps provided");
        require(swaps.length <= 10, "ArbitrageFlashLoan: Too many swaps");

        uint256 currentAmount = amount;
        address currentToken = asset;

        // Execute all swaps in the arbitrage path
        for (uint256 i = 0; i < swaps.length; i++) {
            require(swaps[i].tokenIn == currentToken, "ArbitrageFlashLoan: Token path mismatch");
            
            currentAmount = _executeSwap(swaps[i], currentAmount);
            currentToken = swaps[i].tokenOut;
        }

        // Verify we're back to the original asset
        require(currentToken == asset, "ArbitrageFlashLoan: Path did not return to original asset");
        
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        uint256 totalRepayment = amount + premium;
        
        require(finalBalance >= totalRepayment, "ArbitrageFlashLoan: Insufficient funds to repay loan");

        // Calculate profit
        uint256 profit = finalBalance - totalRepayment;
        require(profit >= MIN_PROFIT_THRESHOLD, "ArbitrageFlashLoan: Profit below minimum threshold");

        // Update statistics
        totalArbitrages++;
        totalProfit += profit;
        accumulatedProfits[asset] += profit;

        uint256 gasUsed = gasStart - gasleft();

        emit ArbitrageExecuted(asset, amount, profit, gasUsed, executor);

        // Approve repayment
        IERC20(asset).safeApprove(address(POOL), totalRepayment);

        return true;
    }

    /**
     * @notice Execute a single swap on specified DEX
     */
    function _executeSwap(
        SwapParams memory swap,
        uint256 amountIn
    ) internal validDexId(swap.dexId) returns (uint256 amountOut) {
        require(swap.deadline >= block.timestamp, "ArbitrageFlashLoan: Swap deadline exceeded");
        
        DexConfig memory config = dexConfigs[swap.dexId];
        
        // Approve token spend
        IERC20(swap.tokenIn).safeApprove(config.router, amountIn);

        if (config.dexType == 0) {
            // UniswapV2 style swap
            amountOut = _swapV2(config.router, swap, amountIn);
        } else if (config.dexType == 1) {
            // UniswapV3 style swap
            amountOut = _swapV3(config.router, swap, amountIn);
        }

        require(amountOut >= swap.amountOutMin, "ArbitrageFlashLoan: Insufficient output amount");
        
        // Verify slippage is within bounds
        uint256 slippage = ((amountIn - amountOut) * 10000) / amountIn;
        require(slippage <= config.maxSlippage, "ArbitrageFlashLoan: Slippage too high");
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
        uint24 fee = 3000; // Default 0.3% fee
        
        // Decode fee from extraData if provided
        if (swap.extraData.length >= 32) {
            fee = abi.decode(swap.extraData, (uint24));
        }

        IUniswapV3Router.ExactInputSingleParams memory params = 
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: swap.tokenIn,
                tokenOut: swap.tokenOut,
                fee: fee,
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
        uint8 dexType,
        bool isActive,
        uint256 maxSlippage
    ) external onlyOwner {
        require(router != address(0), "ArbitrageFlashLoan: Invalid router address");
        require(maxSlippage <= MAX_SLIPPAGE, "ArbitrageFlashLoan: Slippage too high");

        dexConfigs[dexId] = DexConfig({
            router: router,
            dexType: dexType,
            isActive: isActive,
            maxSlippage: maxSlippage
        });

        emit DexConfigUpdated(dexId, router, dexType, isActive);
    }

    /**
     * @notice Set authorized executor
     */
    function setAuthorizedExecutor(address executor, bool authorized) external onlyOwner {
        require(executor != address(0), "ArbitrageFlashLoan: Invalid executor address");
        authorizedExecutors[executor] = authorized;
    }

    /**
     * @notice Withdraw accumulated profits
     */
    function withdrawProfits(address token, uint256 amount) external onlyOwner {
        require(amount <= accumulatedProfits[token], "ArbitrageFlashLoan: Insufficient profits");
        
        accumulatedProfits[token] -= amount;
        IERC20(token).safeTransfer(owner(), amount);
        
        emit ProfitWithdrawn(token, amount, owner());
    }

    /**
     * @notice Emergency withdrawal function
     */
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance;
        
        if (token == address(0)) {
            balance = address(this).balance;
            payable(owner()).transfer(balance);
        } else {
            balance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransfer(owner(), balance);
        }
        
        emit EmergencyWithdrawal(token, balance);
    }

    /**
     * @notice Pause contract operations
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get DEX configuration
     */
    function getDexConfig(uint8 dexId) external view returns (
        address router,
        uint8 dexType,
        bool isActive,
        uint256 maxSlippage
    ) {
        DexConfig memory config = dexConfigs[dexId];
        return (config.router, config.dexType, config.isActive, config.maxSlippage);
    }

    /**
     * @notice Get contract statistics
     */
    function getStatistics() external view returns (
        uint256 _totalArbitrages,
        uint256 _totalProfit,
        uint256 contractBalance
    ) {
        return (totalArbitrages, totalProfit, address(this).balance);
    }

    /**
     * @notice Check if address is authorized executor
     */
    function isAuthorizedExecutor(address executor) external view returns (bool) {
        return authorizedExecutors[executor];
    }

    receive() external payable {}
}