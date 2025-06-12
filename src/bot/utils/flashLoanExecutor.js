import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

/**
 * Flash Loan Executor - Executes arbitrage using Aave V3 flash loans
 * Handles the complex logic of borrowing, swapping, and repaying
 */
export class FlashLoanExecutor {
  constructor(wallet, contractAddress) {
    this.wallet = wallet;
    this.contractAddress = contractAddress;
    this.aavePoolAddress = '0x6807dc923806fE8Fd134338EABCA509979a7e0cB'; // Aave V3 Pool on BSC
    
    // Initialize contract instance
    this.initializeContract();
  }

  initializeContract() {
    // Flash loan arbitrage contract ABI (key functions)
    const contractABI = [
      'function executeArbitrage(address asset, uint256 amount, bytes calldata params) external',
      'function owner() external view returns (address)',
      'function setDexRouters(address[] calldata routers) external',
      'function emergencyWithdraw(address token) external'
    ];
    
    this.contract = new ethers.Contract(
      this.contractAddress,
      contractABI,
      this.wallet
    );
  }

  /**
   * Execute flash loan arbitrage
   */
  async executeFlashLoanArbitrage(opportunity) {
    try {
      console.log('⚡ Preparing flash loan execution...');
      
      // Prepare execution parameters
      const params = await this.prepareExecutionParams(opportunity);
      
      // Calculate flash loan amount (use 80% of available amount to be safe)
      const flashLoanAmount = this.calculateOptimalAmount(opportunity);
      
      // Get the asset address for flash loan
      const assetAddress = this.getAssetAddress(opportunity.path[0]);
      
      // Estimate gas
      const gasEstimate = await this.estimateGas(assetAddress, flashLoanAmount, params);
      
      console.log(`💰 Flash loan amount: ${flashLoanAmount} ${opportunity.path[0]}`);
      console.log(`⛽ Estimated gas: ${gasEstimate}`);
      
      // Execute the flash loan
      const tx = await this.contract.executeArbitrage(
        assetAddress,
        ethers.parseUnits(flashLoanAmount.toString(), 18),
        params,
        {
          gasLimit: gasEstimate,
          gasPrice: ethers.parseUnits('5', 'gwei')
        }
      );
      
      console.log(`📝 Transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        const actualProfit = await this.calculateActualProfit(receipt, opportunity);
        
        return {
          success: true,
          txHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          actualProfit: actualProfit,
          blockNumber: receipt.blockNumber
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed',
          txHash: tx.hash
        };
      }
      
    } catch (error) {
      console.error('❌ Flash loan execution failed:', error.message);
      
      return {
        success: false,
        error: error.message,
        reason: this.parseErrorReason(error)
      };
    }
  }

  /**
   * Prepare execution parameters for the smart contract
   */
  async prepareExecutionParams(opportunity) {
    const swaps = [];
    
    // Convert opportunity swaps to contract format
    for (let i = 0; i < opportunity.swapDetails.length; i++) {
      const swap = opportunity.swapDetails[i];
      
      swaps.push({
        dexId: this.getDexId(swap.dex),
        tokenIn: this.getAssetAddress(swap.from),
        tokenOut: this.getAssetAddress(swap.to),
        amountIn: ethers.parseUnits(swap.amountIn.toString(), 18),
        amountOutMin: ethers.parseUnits(
          swap.amountOut.multipliedBy(0.995).toString(), // 0.5% slippage
          18
        ),
        deadline: Math.floor(Date.now() / 1000) + 300 // 5 minutes
      });
    }
    
    // Encode parameters
    const encoder = ethers.AbiCoder.defaultAbiCoder();
    return encoder.encode(
      ['tuple(uint8 dexId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 deadline)[]'],
      [swaps]
    );
  }

  /**
   * Calculate optimal flash loan amount
   */
  calculateOptimalAmount(opportunity) {
    // Start with base amount and scale based on available liquidity
    const baseAmount = new BigNumber('10'); // 10 units of base token
    
    // Adjust based on expected profit margin
    const profitMargin = opportunity.profitPercent;
    let multiplier = 1;
    
    if (profitMargin > 2) multiplier = 5;
    else if (profitMargin > 1) multiplier = 3;
    else if (profitMargin > 0.5) multiplier = 2;
    
    return baseAmount.multipliedBy(multiplier);
  }

  /**
   * Estimate gas for the transaction
   */
  async estimateGas(assetAddress, amount, params) {
    try {
      const gasEstimate = await this.contract.executeArbitrage.estimateGas(
        assetAddress,
        ethers.parseUnits(amount.toString(), 18),
        params
      );
      
      // Add 20% buffer
      return gasEstimate * BigInt(120) / BigInt(100);
      
    } catch (error) {
      console.error('Error estimating gas:', error.message);
      // Return default high estimate
      return BigInt(500000);
    }
  }

  /**
   * Calculate actual profit from transaction receipt
   */
  async calculateActualProfit(receipt, opportunity) {
    try {
      // Parse logs to find profit events
      const profitLogs = receipt.logs.filter(log => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed.name === 'ArbitrageExecuted';
        } catch {
          return false;
        }
      });
      
      if (profitLogs.length > 0) {
        const profitLog = this.contract.interface.parseLog(profitLogs[0]);
        return new BigNumber(ethers.formatUnits(profitLog.args.profit, 18));
      }
      
      // Fallback: estimate based on gas used
      const gasUsed = new BigNumber(receipt.gasUsed.toString());
      const gasPrice = new BigNumber(receipt.gasPrice?.toString() || '5000000000');
      const gasCost = gasUsed.multipliedBy(gasPrice).div(new BigNumber(10).pow(18));
      
      return opportunity.profit.minus(gasCost);
      
    } catch (error) {
      console.error('Error calculating actual profit:', error.message);
      return new BigNumber(0);
    }
  }

  /**
   * Get DEX ID for the smart contract
   */
  getDexId(dexName) {
    const dexIds = {
      'PANCAKESWAP_V2': 0,
      'PANCAKESWAP_V3': 1,
      'BISWAP': 2,
      'MDEX': 3,
      'UNISWAP_V3': 4,
      'APESWAP': 5
    };
    
    return dexIds[dexName] || 0;
  }

  /**
   * Get asset address by symbol
   */
  getAssetAddress(symbol) {
    // This should return actual token addresses
    // Placeholder implementation
    const addresses = {
      'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      'USDT': '0x55d398326f99059fF775485246999027B3197955',
      'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      'BTCB': '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      'ETH': '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      'CAKE': '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'
    };
    
    return addresses[symbol] || addresses['WBNB'];
  }

  /**
   * Parse error reason from failed transaction
   */
  parseErrorReason(error) {
    if (error.message.includes('insufficient liquidity')) {
      return 'INSUFFICIENT_LIQUIDITY';
    } else if (error.message.includes('slippage')) {
      return 'SLIPPAGE_TOO_HIGH';
    } else if (error.message.includes('deadline')) {
      return 'DEADLINE_EXCEEDED';
    } else if (error.message.includes('gas')) {
      return 'GAS_ESTIMATION_FAILED';
    } else {
      return 'UNKNOWN_ERROR';
    }
  }

  /**
   * Check if flash loan is available
   */
  async checkFlashLoanAvailability(asset, amount) {
    try {
      // Check Aave pool liquidity
      const aavePoolABI = [
        'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))'
      ];
      
      const aavePool = new ethers.Contract(
        this.aavePoolAddress,
        aavePoolABI,
        this.wallet
      );
      
      const reserveData = await aavePool.getReserveData(asset);
      
      // Check if asset is active and borrowing is enabled
      // This is simplified - real implementation would decode configuration
      return reserveData.aTokenAddress !== ethers.ZeroAddress;
      
    } catch (error) {
      console.error('Error checking flash loan availability:', error.message);
      return false;
    }
  }

  /**
   * Get flash loan fee
   */
  getFlashLoanFee() {
    return 0.0009; // 0.09% Aave V3 flash loan fee
  }

  /**
   * Emergency stop function
   */
  async emergencyStop() {
    try {
      console.log('🚨 Executing emergency stop...');
      
      const tx = await this.contract.emergencyWithdraw(
        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // WBNB address
      );
      
      await tx.wait();
      console.log('✅ Emergency withdrawal completed');
      
    } catch (error) {
      console.error('❌ Emergency stop failed:', error.message);
    }
  }
}