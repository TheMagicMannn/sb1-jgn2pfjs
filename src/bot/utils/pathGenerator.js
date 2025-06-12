import { TRADING_PAIRS } from '../config/tokenConfig.js';

/**
 * Path Generator - Creates circular arbitrage paths for flash loans
 * All paths must start and end with the same asset to repay Aave V3 flash loan
 */
export class PathGenerator {
  constructor(tokenAddresses, dexConfigs) {
    this.tokenAddresses = tokenAddresses;
    this.dexConfigs = dexConfigs;
    this.minHops = 2; // Minimum 2 hops (3 tokens total including start/end)
    this.maxHops = 10; // Maximum 10 hops (11 tokens total including start/end)
    this.generatedPaths = [];
    this.dexNames = Object.keys(dexConfigs);
    this.flashLoanAssets = Object.keys(tokenAddresses); // All 6 assets can be flash loan assets
  }

  /**
   * Generate all possible circular arbitrage paths
   * Each path must start and end with the same token for flash loan repayment
   */
  async generateAllPaths() {
    console.log('🔄 Generating circular arbitrage paths for flash loans...');
    console.log(`📊 Flash loan assets: ${this.flashLoanAssets.join(', ')}`);
    
    // Generate paths for EACH of the 6 flash loan assets
    for (const flashLoanAsset of this.flashLoanAssets) {
      console.log(`   🔄 Generating circular paths for flash loan asset: ${flashLoanAsset}`);
      await this.generateCircularPathsFromAsset(flashLoanAsset);
    }

    // Filter and optimize paths
    this.generatedPaths = this.filterAndOptimizePaths(this.generatedPaths);

    console.log(`✅ Generated ${this.generatedPaths.length} circular arbitrage paths`);
    console.log(`   📈 Flash loan asset distribution: ${this.getFlashLoanAssetDistribution()}`);
    console.log(`   🔢 Hop distribution: ${this.getHopDistribution()}`);
    
    return this.generatedPaths;
  }

  /**
   * Generate circular paths starting and ending with a specific asset
   */
  async generateCircularPathsFromAsset(startAsset) {
    const otherTokens = this.flashLoanAssets.filter(token => token !== startAsset);
    
    // Generate paths of different lengths (2 to 10 hops)
    for (let hopCount = this.minHops; hopCount <= this.maxHops; hopCount++) {
      this.generateCircularPathsWithHops(startAsset, hopCount, otherTokens);
    }
  }

  /**
   * Generate circular paths with specific number of hops
   */
  generateCircularPathsWithHops(startAsset, hopCount, availableTokens) {
    const visited = new Set();
    const currentPath = [startAsset];
    
    this.dfsCircularPath(startAsset, startAsset, currentPath, visited, hopCount, 0, availableTokens);
  }

  /**
   * Depth-first search for circular paths
   */
  dfsCircularPath(startAsset, currentAsset, currentPath, visited, targetHops, currentHops, availableTokens) {
    // If we've reached the target number of hops
    if (currentHops === targetHops) {
      // Check if we can return to start asset to complete the circle
      const tradingPairs = TRADING_PAIRS[currentAsset] || [];
      if (tradingPairs.includes(startAsset)) {
        const completePath = [...currentPath, startAsset];
        this.generateDexCombinationsForPath(completePath, startAsset);
      }
      return;
    }

    // Continue exploring if we haven't reached max hops
    if (currentHops < targetHops) {
      const tradingPairs = TRADING_PAIRS[currentAsset] || [];
      
      for (const nextAsset of tradingPairs) {
        // Skip if it's the start asset (unless we're at the target hop count)
        if (nextAsset === startAsset && currentHops < targetHops - 1) continue;
        
        // Skip if we've already visited this asset in current path (prevent loops)
        if (visited.has(nextAsset)) continue;
        
        // Only use available tokens for intermediate steps
        if (currentHops < targetHops - 1 && !availableTokens.includes(nextAsset) && nextAsset !== startAsset) continue;
        
        // Add to path and continue exploring
        visited.add(nextAsset);
        currentPath.push(nextAsset);
        
        this.dfsCircularPath(
          startAsset, 
          nextAsset, 
          currentPath, 
          visited, 
          targetHops, 
          currentHops + 1,
          availableTokens
        );
        
        // Backtrack
        currentPath.pop();
        visited.delete(nextAsset);
      }
    }
  }

  /**
   * Generate all DEX combinations for a given circular token path
   */
  generateDexCombinationsForPath(tokenPath, flashLoanAsset) {
    const swapCount = tokenPath.length - 1; // Number of swaps needed
    
    // Ensure path is truly circular
    if (tokenPath[0] !== tokenPath[tokenPath.length - 1]) {
      console.warn(`Path is not circular: ${tokenPath.join(' → ')}`);
      return;
    }
    
    // Generate strategic DEX combinations (not all possible combinations to avoid explosion)
    const dexCombinations = this.generateStrategicDexCombinations(swapCount);
    
    for (const dexCombination of dexCombinations) {
      // Verify this combination is valid (all pairs exist on respective DEXes)
      if (this.validateDexCombination(tokenPath, dexCombination)) {
        const path = {
          id: this.generatePathId(tokenPath, dexCombination),
          tokens: [...tokenPath],
          dexes: [...dexCombination],
          hops: swapCount,
          flashLoanAsset: flashLoanAsset,
          isCircular: true, // All paths generated here are circular
          swaps: this.generateSwapDetails(tokenPath, dexCombination),
          estimatedComplexity: this.calculatePathComplexity(tokenPath, dexCombination),
          liquidityScore: this.calculateLiquidityScore(tokenPath, flashLoanAsset)
        };
        
        this.generatedPaths.push(path);
      }
    }
  }

  /**
   * Generate strategic DEX combinations (not exhaustive to prevent explosion)
   */
  generateStrategicDexCombinations(swapCount) {
    const combinations = [];
    
    // Strategy 1: Use different DEXes for each swap (maximum arbitrage potential)
    if (swapCount <= this.dexNames.length) {
      for (let i = 0; i < this.dexNames.length - swapCount + 1; i++) {
        const combination = [];
        for (let j = 0; j < swapCount; j++) {
          combination.push(this.dexNames[(i + j) % this.dexNames.length]);
        }
        combinations.push(combination);
      }
    }
    
    // Strategy 2: Alternate between high-liquidity DEXes
    const highLiquidityDexes = ['PANCAKESWAP_V2', 'PANCAKESWAP_V3', 'BISWAP'];
    for (let i = 0; i < Math.min(3, swapCount); i++) {
      const combination = [];
      for (let j = 0; j < swapCount; j++) {
        combination.push(highLiquidityDexes[(i + j) % highLiquidityDexes.length]);
      }
      combinations.push(combination);
    }
    
    // Strategy 3: Mixed V2/V3 combinations
    if (swapCount >= 2) {
      const v2Dexes = ['PANCAKESWAP_V2', 'BISWAP', 'MDEX', 'APESWAP'];
      const v3Dexes = ['PANCAKESWAP_V3', 'UNISWAP_V3'];
      
      // V2 → V3 → V2 pattern
      for (let i = 0; i < Math.min(2, swapCount - 1); i++) {
        const combination = [];
        for (let j = 0; j < swapCount; j++) {
          if (j % 2 === 0) {
            combination.push(v2Dexes[i % v2Dexes.length]);
          } else {
            combination.push(v3Dexes[i % v3Dexes.length]);
          }
        }
        combinations.push(combination);
      }
    }
    
    // Strategy 4: Single DEX with highest volume (for comparison)
    combinations.push(new Array(swapCount).fill('PANCAKESWAP_V2'));
    combinations.push(new Array(swapCount).fill('PANCAKESWAP_V3'));
    
    return combinations;
  }

  /**
   * Calculate liquidity score for a path with flash loan asset consideration
   */
  calculateLiquidityScore(tokenPath, flashLoanAsset) {
    let score = 0;
    
    // High liquidity tokens get higher scores
    const highLiquidityTokens = ['WBNB', 'USDT', 'USDC', 'BTCB', 'ETH'];
    const mediumLiquidityTokens = ['CAKE'];
    
    for (const token of tokenPath) {
      if (highLiquidityTokens.includes(token)) {
        score += 10;
      } else if (mediumLiquidityTokens.includes(token)) {
        score += 5;
      } else {
        score += 1;
      }
    }
    
    // Bonus for flash loan asset being high liquidity
    if (highLiquidityTokens.includes(flashLoanAsset)) {
      score += 25;
    }
    
    // Bonus for paths involving WBNB (native asset)
    if (tokenPath.includes('WBNB')) {
      score += 20;
    }
    
    // Bonus for stablecoin pairs
    const stablecoins = ['USDT', 'USDC'];
    const stablecoinCount = tokenPath.filter(token => stablecoins.includes(token)).length;
    if (stablecoinCount >= 2) {
      score += 15;
    }
    
    // Penalty for very long paths
    if (tokenPath.length > 6) {
      score -= (tokenPath.length - 6) * 5;
    }
    
    return Math.max(score, 0);
  }

  /**
   * Get flash loan asset distribution statistics
   */
  getFlashLoanAssetDistribution() {
    const distribution = {};
    for (const path of this.generatedPaths) {
      distribution[path.flashLoanAsset] = (distribution[path.flashLoanAsset] || 0) + 1;
    }
    return Object.entries(distribution)
      .map(([asset, count]) => `${asset}: ${count}`)
      .join(', ');
  }

  /**
   * Filter and optimize generated paths
   */
  filterAndOptimizePaths(paths) {
    console.log(`   🔍 Filtering ${paths.length} raw circular paths...`);
    
    // Remove duplicate paths
    const uniquePaths = this.removeDuplicatePaths(paths);
    console.log(`   ✨ After deduplication: ${uniquePaths.length} paths`);
    
    // Filter by quality criteria
    const qualityPaths = uniquePaths.filter(path => {
      // Must be circular (double check)
      if (!path.isCircular || path.tokens[0] !== path.tokens[path.tokens.length - 1]) return false;
      
      // Must have reasonable hop count
      if (path.hops < this.minHops || path.hops > this.maxHops) return false;
      
      // Must have minimum liquidity score
      if (path.liquidityScore < 15) return false;
      
      // Must have at least 2 different DEXes for meaningful arbitrage (except for very short paths)
      const uniqueDexes = new Set(path.dexes);
      if (uniqueDexes.size < 2 && path.hops > 3) return false;
      
      // Flash loan asset must be valid
      if (!this.flashLoanAssets.includes(path.flashLoanAsset)) return false;
      
      return true;
    });
    
    console.log(`   ✅ After quality filtering: ${qualityPaths.length} paths`);
    
    // Sort by potential profitability (liquidity score / complexity)
    const sortedPaths = qualityPaths.sort((a, b) => {
      const scoreA = a.liquidityScore / Math.sqrt(a.estimatedComplexity);
      const scoreB = b.liquidityScore / Math.sqrt(b.estimatedComplexity);
      return scoreB - scoreA;
    });
    
    // Ensure balanced distribution across flash loan assets
    const balancedPaths = this.balanceFlashLoanAssetDistribution(sortedPaths);
    
    console.log(`   ⚖️ Final balanced paths: ${balancedPaths.length}`);
    
    return balancedPaths;
  }

  /**
   * Balance distribution across all flash loan assets
   */
  balanceFlashLoanAssetDistribution(paths) {
    const maxPathsPerAsset = 200; // Maximum paths per flash loan asset
    const assetPaths = {};
    
    // Group paths by flash loan asset
    for (const path of paths) {
      if (!assetPaths[path.flashLoanAsset]) {
        assetPaths[path.flashLoanAsset] = [];
      }
      assetPaths[path.flashLoanAsset].push(path);
    }
    
    // Take top paths for each asset
    const balancedPaths = [];
    for (const asset of this.flashLoanAssets) {
      const pathsForAsset = assetPaths[asset] || [];
      const topPaths = pathsForAsset.slice(0, maxPathsPerAsset);
      balancedPaths.push(...topPaths);
      
      console.log(`   📊 ${asset}: ${topPaths.length} paths`);
    }
    
    return balancedPaths;
  }

  /**
   * Get paths by flash loan asset for scanning rotation
   */
  getPathsByFlashLoanAsset(asset) {
    return this.generatedPaths.filter(path => path.flashLoanAsset === asset);
  }

  /**
   * Get paths for current scan cycle (rotate through different assets and hop counts)
   */
  getPathsForScanCycle(scanIndex) {
    const assetIndex = scanIndex % this.flashLoanAssets.length;
    const currentAsset = this.flashLoanAssets[assetIndex];
    
    // Get paths for current flash loan asset
    const assetPaths = this.getPathsByFlashLoanAsset(currentAsset);
    
    // Further filter by hop count based on scan cycle
    const hopCycle = Math.floor(scanIndex / this.flashLoanAssets.length) % 4;
    
    let filteredPaths;
    switch (hopCycle) {
      case 0:
        // Short paths (2-3 hops)
        filteredPaths = assetPaths.filter(p => p.hops >= 2 && p.hops <= 3);
        break;
      case 1:
        // Medium paths (4-5 hops)
        filteredPaths = assetPaths.filter(p => p.hops >= 4 && p.hops <= 5);
        break;
      case 2:
        // Long paths (6-8 hops)
        filteredPaths = assetPaths.filter(p => p.hops >= 6 && p.hops <= 8);
        break;
      case 3:
        // Very long paths (9-10 hops)
        filteredPaths = assetPaths.filter(p => p.hops >= 9 && p.hops <= 10);
        break;
      default:
        filteredPaths = assetPaths;
    }
    
    // Return top 25 paths for this cycle
    return filteredPaths.slice(0, 25);
  }

  /**
   * Validate that a DEX combination is valid for the token path
   */
  validateDexCombination(tokenPath, dexCombination) {
    for (let i = 0; i < dexCombination.length; i++) {
      const tokenIn = tokenPath[i];
      const tokenOut = tokenPath[i + 1];
      const dex = dexCombination[i];
      
      // Check if this token pair is likely to exist on this DEX
      if (!this.isPairLikelyToExist(tokenIn, tokenOut, dex)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a token pair is likely to exist on a specific DEX
   */
  isPairLikelyToExist(tokenIn, tokenOut, dex) {
    // Basic validation - in production, you'd check actual pair existence
    const tradingPairs = TRADING_PAIRS[tokenIn] || [];
    return tradingPairs.includes(tokenOut);
  }

  /**
   * Generate swap details for a path
   */
  generateSwapDetails(tokenPath, dexCombination) {
    const swaps = [];
    
    for (let i = 0; i < dexCombination.length; i++) {
      swaps.push({
        index: i,
        tokenIn: tokenPath[i],
        tokenOut: tokenPath[i + 1],
        dex: dexCombination[i],
        dexConfig: this.dexConfigs[dexCombination[i]]
      });
    }
    
    return swaps;
  }

  /**
   * Calculate path complexity score
   */
  calculatePathComplexity(tokenPath, dexCombination) {
    let complexity = 0;
    
    // Add complexity for number of hops
    complexity += (tokenPath.length - 1) * 10;
    
    // Add complexity for DEX diversity (good for arbitrage)
    const uniqueDexes = new Set(dexCombination);
    complexity += uniqueDexes.size * 5;
    
    // Add complexity for V3 DEXes (higher gas costs)
    const v3Count = dexCombination.filter(dex => 
      this.dexConfigs[dex]?.type === 'UniswapV3'
    ).length;
    complexity += v3Count * 15;
    
    return complexity;
  }

  /**
   * Remove duplicate paths
   */
  removeDuplicatePaths(paths) {
    const seen = new Set();
    return paths.filter(path => {
      const key = `${path.tokens.join('-')}:${path.dexes.join('-')}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate unique ID for a path
   */
  generatePathId(tokenPath, dexCombination) {
    const tokenStr = tokenPath.join('-');
    const dexStr = dexCombination.join('-');
    const hash = this.simpleHash(`${tokenStr}:${dexStr}`);
    return `arb_${hash}`;
  }

  /**
   * Simple hash function for path IDs
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get hop distribution statistics
   */
  getHopDistribution() {
    const distribution = {};
    for (const path of this.generatedPaths) {
      distribution[path.hops] = (distribution[path.hops] || 0) + 1;
    }
    return Object.entries(distribution)
      .map(([hops, count]) => `${hops}-hop: ${count}`)
      .join(', ');
  }

  /**
   * Get comprehensive path statistics
   */
  getPathStatistics() {
    const stats = {
      totalPaths: this.generatedPaths.length,
      byHops: {},
      byFlashLoanAsset: {},
      byDexUsage: {},
      byLiquidityScore: {
        high: 0,    // score >= 50
        medium: 0,  // score 30-49
        low: 0      // score < 30
      },
      averageComplexity: 0,
      averageLiquidityScore: 0
    };
    
    let totalComplexity = 0;
    let totalLiquidityScore = 0;
    
    for (const path of this.generatedPaths) {
      // Count by hops
      stats.byHops[path.hops] = (stats.byHops[path.hops] || 0) + 1;
      
      // Count by flash loan asset
      stats.byFlashLoanAsset[path.flashLoanAsset] = 
        (stats.byFlashLoanAsset[path.flashLoanAsset] || 0) + 1;
      
      // Count DEX usage
      for (const dex of path.dexes) {
        stats.byDexUsage[dex] = (stats.byDexUsage[dex] || 0) + 1;
      }
      
      // Categorize by liquidity score
      if (path.liquidityScore >= 50) {
        stats.byLiquidityScore.high++;
      } else if (path.liquidityScore >= 30) {
        stats.byLiquidityScore.medium++;
      } else {
        stats.byLiquidityScore.low++;
      }
      
      totalComplexity += path.estimatedComplexity;
      totalLiquidityScore += path.liquidityScore;
    }
    
    if (this.generatedPaths.length > 0) {
      stats.averageComplexity = totalComplexity / this.generatedPaths.length;
      stats.averageLiquidityScore = totalLiquidityScore / this.generatedPaths.length;
    }
    
    return stats;
  }
}