import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { ROUTER_ABI, QUOTER_V3_ABI } from '../config/dexConfig.js';

/**
 * Price Fetcher - Retrieves real-time prices from multiple DEXes
 * Supports both Uniswap V2 and V3 style DEXes
 */
export class PriceFetcher {
  constructor(provider, dexConfigs) {
    this.provider = provider;
    this.dexConfigs = dexConfigs;
    this.contracts = {};
    this.priceCache = new Map();
    this.cacheTimeout = 5000; // 5 seconds cache
    
    this.initializeContracts();
  }

  initializeContracts() {
    for (const [dexName, config] of Object.entries(this.dexConfigs)) {
      try {
        if (config.type === 'UniswapV2') {
          this.contracts[dexName] = {
            router: new ethers.Contract(config.router, ROUTER_ABI, this.provider),
            type: 'v2'
          };
        } else if (config.type === 'UniswapV3') {
          this.contracts[dexName] = {
            router: new ethers.Contract(config.router, ROUTER_ABI, this.provider),
            quoter: new ethers.Contract(config.quoter, QUOTER_V3_ABI, this.provider),
            type: 'v3'
          };
        }
      } catch (error) {
        console.error(`Failed to initialize ${dexName} contracts:`, error.message);
      }
    }
  }

  /**
   * Get price for a specific token pair on a specific DEX
   */
  async getPrice(dexName, tokenIn, tokenOut, amountIn) {
    const cacheKey = `${dexName}-${tokenIn}-${tokenOut}-${amountIn}`;
    
    // Check cache first
    if (this.priceCache.has(cacheKey)) {
      const cached = this.priceCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      const contract = this.contracts[dexName];
      if (!contract) {
        throw new Error(`Contract not found for ${dexName}`);
      }

      let amountOut;
      
      if (contract.type === 'v2') {
        amountOut = await this.getPriceV2(contract.router, tokenIn, tokenOut, amountIn);
      } else if (contract.type === 'v3') {
        amountOut = await this.getPriceV3(dexName, contract.quoter, tokenIn, tokenOut, amountIn);
      }

      const result = {
        dex: dexName,
        tokenIn,
        tokenOut,
        amountIn: new BigNumber(amountIn),
        amountOut: new BigNumber(amountOut),
        price: new BigNumber(amountOut).div(amountIn),
        timestamp: Date.now()
      };

      // Cache the result
      this.priceCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error(`Error fetching price from ${dexName}:`, error.message);
      return null;
    }
  }

  /**
   * Get price from Uniswap V2 style DEX
   */
  async getPriceV2(routerContract, tokenIn, tokenOut, amountIn) {
    try {
      const path = [tokenIn, tokenOut];
      const amounts = await routerContract.getAmountsOut(
        ethers.parseUnits(amountIn.toString(), 18),
        path
      );
      
      return ethers.formatUnits(amounts[1], 18);
    } catch (error) {
      // Try with WBNB as intermediate token if direct pair doesn't exist
      const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
      if (tokenIn !== WBNB && tokenOut !== WBNB) {
        try {
          const path = [tokenIn, WBNB, tokenOut];
          const amounts = await routerContract.getAmountsOut(
            ethers.parseUnits(amountIn.toString(), 18),
            path
          );
          return ethers.formatUnits(amounts[2], 18);
        } catch (innerError) {
          throw error; // Throw original error if intermediate routing also fails
        }
      }
      throw error;
    }
  }

  /**
   * Get price from Uniswap V3 style DEX
   */
  async getPriceV3(dexName, quoterContract, tokenIn, tokenOut, amountIn) {
    const config = this.dexConfigs[dexName];
    
    // Try different fee tiers
    for (const fee of config.fees) {
      try {
        const amountOut = await quoterContract.quoteExactInputSingle.staticCall(
          tokenIn,
          tokenOut,
          fee,
          ethers.parseUnits(amountIn.toString(), 18),
          0 // sqrtPriceLimitX96 = 0 (no limit)
        );
        
        return ethers.formatUnits(amountOut, 18);
      } catch (error) {
        // Try next fee tier if this one fails
        continue;
      }
    }
    
    throw new Error(`No valid pool found for ${tokenIn}/${tokenOut} on ${dexName}`);
  }

  /**
   * Get prices from all DEXes for a specific pair
   */
  async getAllPricesForPair(tokenIn, tokenOut, amountIn = '1') {
    const promises = Object.keys(this.contracts).map(async dexName => {
      try {
        const result = await this.getPrice(dexName, tokenIn, tokenOut, amountIn);
        return { dexName, result };
      } catch (error) {
        return { dexName, result: null };
      }
    });

    const results = await Promise.allSettled(promises);
    const prices = {};

    results.forEach((promiseResult) => {
      if (promiseResult.status === 'fulfilled' && promiseResult.value.result) {
        prices[promiseResult.value.dexName] = promiseResult.value.result;
      }
    });

    return prices;
  }

  /**
   * Get all prices for multiple pairs across all DEXes
   */
  async getAllPrices(tokenPairs = [], amountIn = '1') {
    const allPrices = {};

    for (const [tokenIn, tokenOut] of tokenPairs) {
      const pairKey = `${tokenIn}/${tokenOut}`;
      allPrices[pairKey] = await this.getAllPricesForPair(tokenIn, tokenOut, amountIn);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allPrices;
  }

  /**
   * Calculate price impact for a trade
   */
  async calculatePriceImpact(dexName, tokenIn, tokenOut, amountIn) {
    try {
      // Get price for small amount (0.1 unit)
      const smallAmount = '0.1';
      const smallPrice = await this.getPrice(dexName, tokenIn, tokenOut, smallAmount);
      
      // Get price for actual amount
      const actualPrice = await this.getPrice(dexName, tokenIn, tokenOut, amountIn);
      
      if (!smallPrice || !actualPrice) {
        return null;
      }

      // Calculate price impact
      const priceImpact = smallPrice.price.minus(actualPrice.price)
        .div(smallPrice.price)
        .multipliedBy(100)
        .abs(); // Use absolute value

      return {
        priceImpact: priceImpact.toNumber(),
        smallPrice: smallPrice.price.toNumber(),
        actualPrice: actualPrice.price.toNumber()
      };

    } catch (error) {
      console.error(`Error calculating price impact for ${dexName}:`, error.message);
      return null;
    }
  }

  /**
   * Find best price across all DEXes
   */
  async findBestPrice(tokenIn, tokenOut, amountIn, isSell = false) {
    const prices = await this.getAllPricesForPair(tokenIn, tokenOut, amountIn);
    
    if (Object.keys(prices).length === 0) {
      return null;
    }

    let bestPrice = null;
    let bestDex = null;

    for (const [dexName, priceData] of Object.entries(prices)) {
      if (!priceData) continue;

      const currentPrice = isSell ? priceData.price : new BigNumber(1).div(priceData.price);
      
      if (!bestPrice || currentPrice.gt(bestPrice)) {
        bestPrice = currentPrice;
        bestDex = dexName;
      }
    }

    return {
      dex: bestDex,
      price: bestPrice,
      data: prices[bestDex]
    };
  }

  /**
   * Check if a trading pair exists on a DEX
   */
  async checkPairExists(dexName, tokenIn, tokenOut) {
    try {
      const result = await this.getPrice(dexName, tokenIn, tokenOut, '0.1');
      return result !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get liquidity information for a pair
   */
  async getLiquidityInfo(dexName, tokenIn, tokenOut) {
    try {
      const config = this.dexConfigs[dexName];
      if (config.type === 'UniswapV2') {
        // For V2, we can check pair reserves
        const factoryABI = ['function getPair(address tokenA, address tokenB) external view returns (address pair)'];
        const pairABI = ['function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'];
        
        const factory = new ethers.Contract(config.factory, factoryABI, this.provider);
        const pairAddress = await factory.getPair(tokenIn, tokenOut);
        
        if (pairAddress === ethers.ZeroAddress) {
          return null;
        }
        
        const pair = new ethers.Contract(pairAddress, pairABI, this.provider);
        const reserves = await pair.getReserves();
        
        return {
          reserve0: ethers.formatUnits(reserves[0], 18),
          reserve1: ethers.formatUnits(reserves[1], 18),
          pairAddress
        };
      }
      
      return null; // V3 liquidity checking is more complex
    } catch (error) {
      console.error(`Error getting liquidity info for ${dexName}:`, error.message);
      return null;
    }
  }

  /**
   * Clear price cache
   */
  clearCache() {
    this.priceCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.priceCache.size,
      timeout: this.cacheTimeout
    };
  }
}