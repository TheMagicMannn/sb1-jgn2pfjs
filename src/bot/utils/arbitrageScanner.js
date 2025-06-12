import BigNumber from 'bignumber.js';
import { PRICE_IMPACT_THRESHOLDS, MIN_LIQUIDITY_THRESHOLDS, TOKEN_ADDRESSES } from '../config/tokenConfig.js';

/**
 * Arbitrage Scanner - Detects profitable circular arbitrage opportunities
 * Specifically designed for flash loan arbitrage where borrowed asset must be repaid
 */
export class ArbitrageScanner {
  constructor(priceFetcher) {
    this.priceFetcher = priceFetcher;
    this.minProfitThreshold = 0.001; // 0.1% minimum profit
    this.maxPriceImpact = 2; // 2% max price impact
    this.gasPrice = new BigNumber('5'); // 5 gwei
    this.priorityFee = new BigNumber('2'); // 2 gwei priority fee
    this.flashLoanFee = 0.0009; // 0.09% Aave V3 flash loan fee
  }

  /**
   * Scan a circular path for flash loan arbitrage opportunities
   */
  async scanPath(path, currentPrices = null) {
    try {
      // Validate path is circular (required for flash loans)
      if (!path.isCircular || path.tokens[0] !== path.tokens[path.tokens.length - 1]) {
        console.warn(`Path ${path.id} is not circular - skipping`);
        return null;
      }

      // Calculate potential profit for this circular path
      const opportunity = await this.calculateCircularPathProfit(path, currentPrices);
      
      if (!opportunity) return null;
      
      // Check if opportunity meets minimum criteria
      if (opportunity.profitPercent < this.minProfitThreshold) return null;
      
      // Calculate total costs (gas + flash loan fee)
      const totalCosts = await this.calculateTotalCosts(path, opportunity.flashLoanAmount);
      opportunity.gasCost = totalCosts.gasCost;
      opportunity.flashLoanFee = totalCosts.flashLoanFee;
      opportunity.totalCosts = totalCosts.total;
      
      // Calculate net profit after all costs
      opportunity.profitAfterCosts = opportunity.grossProfit.minus(opportunity.totalCosts);
      opportunity.netROI = opportunity.profitAfterCosts.div(opportunity.flashLoanAmount).multipliedBy(100);
      
      // Add risk assessment
      opportunity.confidence = this.calculateConfidenceScore(opportunity);
      opportunity.riskLevel = this.calculateRiskLevel(opportunity);
      
      // Only return profitable opportunities after all costs
      return opportunity.profitAfterCosts.gt(0) ? opportunity : null;
      
    } catch (error) {
      console.error(`Error scanning circular path ${path.id}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate profit potential for a circular arbitrage path
   */
  async calculateCircularPathProfit(path, currentPrices = null) {
    // Start with flash loan amount (optimize based on path characteristics)
    const flashLoanAmount = this.calculateOptimalFlashLoanAmount(path);
    let currentAmount = flashLoanAmount;
    let currentToken = path.tokens[0]; // Flash loan asset
    
    const swapDetails = [];
    const flashLoanAsset = path.tokens[0];
    
    // Execute each swap in the circular path
    for (let i = 0; i < path.dexes.length; i++) {
      const nextToken = path.tokens[i + 1];
      const dex = path.dexes[i];
      
      // Get token addresses
      const currentTokenAddress = this.getTokenAddress(currentToken);
      const nextTokenAddress = this.getTokenAddress(nextToken);
      
      // Get price for this swap
      const priceData = currentPrices 
        ? this.getPriceFromCache(currentPrices, dex, currentTokenAddress, nextTokenAddress, currentAmount.toString())
        : await this.priceFetcher.getPrice(dex, currentTokenAddress, nextTokenAddress, currentAmount.toString());
      
      if (!priceData) {
        console.warn(`No price data for ${currentToken} -> ${nextToken} on ${dex}`);
        return null; // Cannot complete this path
      }
      
      // Calculate price impact
      const priceImpact = await this.calculatePriceImpact(
        dex, currentTokenAddress, nextTokenAddress, currentAmount.toString()
      );
      
      if (priceImpact && priceImpact.priceImpact > this.maxPriceImpact) {
        console.warn(`Price impact too high: ${priceImpact.priceImpact}% for ${currentToken} -> ${nextToken}`);
        return null; // Price impact too high
      }
      
      const amountOut = new BigNumber(priceData.amountOut);
      
      swapDetails.push({
        index: i,
        from: currentToken,
        to: nextToken,
        dex: dex,
        amountIn: currentAmount,
        amountOut: amountOut,
        price: new BigNumber(priceData.price),
        priceImpact: priceImpact ? priceImpact.priceImpact : 0,
        slippage: this.calculateSlippage(currentAmount, amountOut, priceData.price)
      });
      
      currentAmount = amountOut;
      currentToken = nextToken;
    }
    
    // Verify we're back to the flash loan asset
    if (currentToken !== flashLoanAsset) {
      console.error(`Path did not return to flash loan asset. Expected: ${flashLoanAsset}, Got: ${currentToken}`);
      return null;
    }
    
    // Calculate gross profit (before fees)
    const finalAmount = currentAmount;
    const grossProfit = finalAmount.minus(flashLoanAmount);
    const grossProfitPercent = grossProfit.div(flashLoanAmount).multipliedBy(100);
    
    return {
      pathId: path.id,
      path: path.tokens,
      dexes: path.dexes,
      flashLoanAsset: flashLoanAsset,
      flashLoanAmount: flashLoanAmount,
      finalAmount: finalAmount,
      grossProfit: grossProfit,
      profitPercent: grossProfitPercent.toNumber(),
      swapDetails: swapDetails,
      timestamp: Date.now(),
      isCircular: true,
      totalHops: path.hops
    };
  }

  /**
   * Calculate optimal flash loan amount based on path characteristics
   */
  calculateOptimalFlashLoanAmount(path) {
    // Base amount depends on the flash loan asset
    const baseAmounts = {
      'WBNB': new BigNumber('10'),    // 10 BNB
      'USDT': new BigNumber('3000'),  // $3000
      'USDC': new BigNumber('3000'),  // $3000
      'BTCB': new BigNumber('0.1'),   // 0.1 BTC
      'ETH': new BigNumber('1.5'),    // 1.5 ETH
      'CAKE': new BigNumber('1000')   // 1000 CAKE
    };
    
    let baseAmount = baseAmounts[path.flashLoanAsset] || new BigNumber('1');
    
    // Adjust based on path complexity
    if (path.hops <= 3) {
      baseAmount = baseAmount.multipliedBy(2); // More aggressive for simple paths
    } else if (path.hops >= 6) {
      baseAmount = baseAmount.multipliedBy(0.5); // More conservative for complex paths
    }
    
    // Adjust based on liquidity score
    if (path.liquidityScore >= 50) {
      baseAmount = baseAmount.multipliedBy(1.5);
    } else if (path.liquidityScore < 30) {
      baseAmount = baseAmount.multipliedBy(0.7);
    }
    
    return baseAmount;
  }

  /**
   * Calculate total costs (gas + flash loan fee)
   */
  async calculateTotalCosts(path, flashLoanAmount) {
    // Calculate gas cost
    const gasCost = await this.estimateGasCost(path);
    
    // Calculate flash loan fee (0.09% of borrowed amount)
    const flashLoanFee = flashLoanAmount.multipliedBy(this.flashLoanFee);
    
    // Total costs in the same asset as flash loan
    const totalCosts = gasCost.plus(flashLoanFee);
    
    return {
      gasCost: gasCost,
      flashLoanFee: flashLoanFee,
      total: totalCosts
    };
  }

  /**
   * Estimate gas cost for a circular arbitrage path
   */
  async estimateGasCost(path) {
    const baseGasPerSwap = 150000; // Base gas per swap
    const additionalGasPerHop = 30000; // Additional gas for each hop
    const flashLoanOverhead = 250000; // Flash loan setup and teardown
    const circularPathOverhead = 50000; // Additional overhead for circular validation
    
    const totalGas = baseGasPerSwap * path.hops + 
                    additionalGasPerHop * Math.max(0, path.hops - 2) +
                    flashLoanOverhead +
                    circularPathOverhead;
    
    // Add extra gas for V3 swaps
    const v3SwapCount = path.dexes.filter(dex => 
      dex.includes('V3') || dex.includes('UNISWAP_V3')
    ).length;
    const v3ExtraGas = v3SwapCount * 50000;
    
    const finalGasEstimate = totalGas + v3ExtraGas;
    
    const gasPrice = this.gasPrice.plus(this.priorityFee);
    const gasCostWei = new BigNumber(finalGasEstimate).multipliedBy(gasPrice).multipliedBy(new BigNumber(10).pow(9));
    
    // Convert to flash loan asset units (assuming BNB for now)
    const gasCostInAsset = gasCostWei.div(new BigNumber(10).pow(18));
    
    return gasCostInAsset;
  }

  /**
   * Calculate slippage for a swap
   */
  calculateSlippage(amountIn, amountOut, expectedPrice) {
    const actualPrice = amountOut.div(amountIn);
    const slippage = expectedPrice.minus(actualPrice).div(expectedPrice).multipliedBy(100).abs();
    return slippage.toNumber();
  }

  /**
   * Get price from cached prices
   */
  getPriceFromCache(currentPrices, dex, tokenIn, tokenOut, amountIn) {
    const pairKey = `${tokenIn}/${tokenOut}`;
    const reversePairKey = `${tokenOut}/${tokenIn}`;
    
    if (currentPrices[pairKey] && currentPrices[pairKey][dex]) {
      return currentPrices[pairKey][dex];
    }
    
    // Try reverse pair
    if (currentPrices[reversePairKey] && currentPrices[reversePairKey][dex]) {
      const reversePrice = currentPrices[reversePairKey][dex];
      return {
        ...reversePrice,
        amountOut: new BigNumber(amountIn).div(reversePrice.price),
        price: new BigNumber(1).div(reversePrice.price)
      };
    }
    
    return null;
  }

  /**
   * Calculate price impact for a trade
   */
  async calculatePriceImpact(dex, tokenIn, tokenOut, amountIn) {
    try {
      return await this.priceFetcher.calculatePriceImpact(dex, tokenIn, tokenOut, amountIn);
    } catch (error) {
      console.error(`Error calculating price impact:`, error.message);
      return null;
    }
  }

  /**
   * Scan multiple circular paths concurrently
   */
  async scanMultiplePaths(paths, maxConcurrent = 8) {
    const opportunities = [];
    
    // Filter to only circular paths
    const circularPaths = paths.filter(path => path.isCircular);
    
    console.log(`Scanning ${circularPaths.length} circular paths for arbitrage opportunities...`);
    
    // Process paths in batches to avoid overwhelming the network
    for (let i = 0; i < circularPaths.length; i += maxConcurrent) {
      const batch = circularPaths.slice(i, i + maxConcurrent);
      const batchPromises = batch.map(path => this.scanPath(path));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          opportunities.push(result.value);
        } else if (result.status === 'rejected') {
          console.error(`Path scan failed:`, result.reason);
        }
      });
      
      // Small delay between batches
      if (i + maxConcurrent < circularPaths.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Sort by net profitability (after all costs)
    const sortedOpportunities = opportunities.sort((a, b) => 
      b.profitAfterCosts.minus(a.profitAfterCosts).toNumber()
    );
    
    console.log(`Found ${sortedOpportunities.length} profitable circular arbitrage opportunities`);
    
    return sortedOpportunities;
  }

  /**
   * Find best circular arbitrage opportunity
   */
  async findBestCircularOpportunity(paths) {
    const opportunities = await this.scanMultiplePaths(paths);
    
    if (opportunities.length === 0) return null;
    
    // Return the most profitable opportunity after costs
    const best = opportunities[0];
    
    console.log(`Best opportunity: ${best.profitAfterCosts.toFixed(6)} ${best.flashLoanAsset} profit`);
    console.log(`Path: ${best.path.join(' → ')}`);
    console.log(`DEXes: ${best.dexes.join(' → ')}`);
    
    return best;
  }

  /**
   * Calculate confidence score for a circular arbitrage opportunity
   */
  calculateConfidenceScore(opportunity) {
    let score = 100;
    
    // Reduce score based on price impact
    const maxPriceImpact = Math.max(...opportunity.swapDetails.map(s => s.priceImpact));
    score -= maxPriceImpact * 8;
    
    // Reduce score based on number of hops
    score -= Math.max(0, opportunity.totalHops - 3) * 3;
    
    // Reduce score if profit margin is small
    if (opportunity.netROI < 1) score -= 25;
    if (opportunity.netROI < 0.5) score -= 35;
    
    // Bonus for circular paths (required for flash loans)
    if (opportunity.isCircular) score += 15;
    
    // Bonus for involving high-liquidity tokens
    const highLiqTokens = ['WBNB', 'USDT', 'USDC'];
    const highLiqCount = opportunity.path.filter(token => highLiqTokens.includes(token)).length;
    score += highLiqCount * 3;
    
    // Penalty for high slippage
    const maxSlippage = Math.max(...opportunity.swapDetails.map(s => s.slippage));
    if (maxSlippage > 1) score -= 20;
    if (maxSlippage > 2) score -= 30;
    
    return Math.max(Math.min(score, 100), 0);
  }

  /**
   * Calculate risk level for a circular arbitrage opportunity
   */
  calculateRiskLevel(opportunity) {
    const maxPriceImpact = Math.max(...opportunity.swapDetails.map(s => s.priceImpact));
    const hopCount = opportunity.totalHops;
    const profitMargin = opportunity.netROI;
    const maxSlippage = Math.max(...opportunity.swapDetails.map(s => s.slippage));
    
    let riskScore = 0;
    
    // Price impact risk
    if (maxPriceImpact > 1.5) riskScore += 3;
    else if (maxPriceImpact > 1) riskScore += 2;
    else if (maxPriceImpact > 0.5) riskScore += 1;
    
    // Complexity risk
    if (hopCount > 6) riskScore += 3;
    else if (hopCount > 4) riskScore += 2;
    else if (hopCount > 3) riskScore += 1;
    
    // Profit margin risk
    if (profitMargin < 0.3) riskScore += 3;
    else if (profitMargin < 0.5) riskScore += 2;
    else if (profitMargin < 1) riskScore += 1;
    
    // Slippage risk
    if (maxSlippage > 2) riskScore += 2;
    else if (maxSlippage > 1) riskScore += 1;
    
    if (riskScore >= 6) return 'HIGH';
    if (riskScore >= 4) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Helper function to get token address
   */
  getTokenAddress(symbol) {
    const token = TOKEN_ADDRESSES[symbol];
    return token ? token.address : symbol;
  }

  /**
   * Update scanner parameters
   */
  updateParameters(params) {
    if (params.minProfitThreshold) this.minProfitThreshold = params.minProfitThreshold;
    if (params.maxPriceImpact) this.maxPriceImpact = params.maxPriceImpact;
    if (params.gasPrice) this.gasPrice = new BigNumber(params.gasPrice);
    if (params.priorityFee) this.priorityFee = new BigNumber(params.priorityFee);
    if (params.flashLoanFee) this.flashLoanFee = params.flashLoanFee;
  }

  /**
   * Get scanner statistics
   */
  getStatistics() {
    return {
      minProfitThreshold: this.minProfitThreshold,
      maxPriceImpact: this.maxPriceImpact,
      gasPrice: this.gasPrice.toString(),
      priorityFee: this.priorityFee.toString(),
      flashLoanFee: this.flashLoanFee
    };
  }
}