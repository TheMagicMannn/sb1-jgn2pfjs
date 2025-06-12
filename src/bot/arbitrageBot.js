import Web3 from 'web3';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { DEX_CONFIGS } from './config/dexConfig.js';
import { TOKEN_ADDRESSES } from './config/tokenConfig.js';
import { PriceFetcher } from './utils/priceFetcher.js';
import { PathGenerator } from './utils/pathGenerator.js';
import { ArbitrageScanner } from './utils/arbitrageScanner.js';
import { FlashLoanExecutor } from './utils/flashLoanExecutor.js';

/**
 * BSC Multi-DEX Arbitrage Bot with Flash Loans
 * 
 * DISCLAIMER: This is for educational purposes only.
 * Trading cryptocurrencies involves substantial risk of loss.
 * Never use this code with real funds without proper testing and risk management.
 */
class ArbitrageBot {
  constructor(config) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    
    // Initialize components with proper provider
    this.priceFetcher = new PriceFetcher(this.provider, DEX_CONFIGS);
    this.pathGenerator = new PathGenerator(TOKEN_ADDRESSES, DEX_CONFIGS);
    this.scanner = new ArbitrageScanner(this.priceFetcher);
    this.executor = new FlashLoanExecutor(this.wallet, config.contractAddress);
    
    this.isRunning = false;
    this.circularPaths = [];
    this.currentScanIndex = 0; // For cycling through different flash loan assets and hop counts
    this.stats = {
      totalScans: 0,
      circularOpportunitiesFound: 0,
      flashLoanExecutions: 0,
      totalProfit: new BigNumber(0),
      errors: 0,
      pathsGenerated: 0,
      scanCycles: {
        WBNB: 0,
        BTCB: 0,
        ETH: 0,
        USDT: 0,
        USDC: 0,
        CAKE: 0
      }
    };
    
    console.log('🤖 BSC Flash Loan Arbitrage Bot initialized');
    console.log(`📊 Monitoring ${Object.keys(DEX_CONFIGS).length} DEXes`);
    console.log(`💰 Flash loan assets: ${Object.keys(TOKEN_ADDRESSES).join(', ')}`);
    console.log(`🔗 Connected to: ${config.rpcUrl}`);
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Bot is already running');
      return;
    }

    try {
      // Verify network connection and flash loan contract
      await this.verifyConnection();
      await this.verifyFlashLoanContract();
      
      this.isRunning = true;
      console.log('🚀 Starting flash loan arbitrage bot...');
      
      // Generate all circular arbitrage paths for ALL flash loan assets
      console.log('🔄 Generating circular arbitrage paths for ALL flash loan assets...');
      this.circularPaths = await this.pathGenerator.generateAllPaths();
      this.stats.pathsGenerated = this.circularPaths.length;
      
      // Validate all paths are circular
      const nonCircularPaths = this.circularPaths.filter(path => !path.isCircular);
      if (nonCircularPaths.length > 0) {
        console.warn(`⚠️ Found ${nonCircularPaths.length} non-circular paths - these will be filtered out`);
        this.circularPaths = this.circularPaths.filter(path => path.isCircular);
      }
      
      console.log(`✅ Generated ${this.circularPaths.length} circular arbitrage paths`);
      this.printPathStatistics();

      // Start the main scanning loop
      this.scanLoop();
      
    } catch (error) {
      console.error('❌ Failed to start bot:', error.message);
      this.isRunning = false;
    }
  }

  async verifyConnection() {
    try {
      const network = await this.provider.getNetwork();
      const balance = await this.provider.getBalance(this.wallet.address);
      
      console.log(`🌐 Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
      console.log(`👤 Wallet address: ${this.wallet.address}`);
      console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} BNB`);
      
      if (balance < ethers.parseEther('0.01')) {
        console.warn('⚠️ Low wallet balance - may not be sufficient for gas fees');
      }
      
    } catch (error) {
      throw new Error(`Network connection failed: ${error.message}`);
    }
  }

  async verifyFlashLoanContract() {
    try {
      if (!this.config.contractAddress || this.config.contractAddress === '0x' + '0'.repeat(40)) {
        throw new Error('Flash loan contract address not configured');
      }
      
      const code = await this.provider.getCode(this.config.contractAddress);
      if (code === '0x') {
        throw new Error('Flash loan contract not deployed at specified address');
      }
      
      console.log(`✅ Flash loan contract verified at: ${this.config.contractAddress}`);
      
    } catch (error) {
      throw new Error(`Flash loan contract verification failed: ${error.message}`);
    }
  }

  async stop() {
    this.isRunning = false;
    console.log('⏹️ Flash loan arbitrage bot stopped');
    this.printStats();
  }

  async scanLoop() {
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    while (this.isRunning) {
      try {
        await this.scanForCircularOpportunities();
        this.stats.totalScans++;
        consecutiveErrors = 0; // Reset error counter on success
        
        // Increment scan index for cycling through different assets and hop counts
        this.currentScanIndex++;
        
        // Dynamic delay based on network conditions and findings
        const delay = this.calculateScanDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
        
      } catch (error) {
        console.error('❌ Error in scan loop:', error.message);
        this.stats.errors++;
        consecutiveErrors++;
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ Too many consecutive errors (${consecutiveErrors}). Stopping bot.`);
          await this.stop();
          break;
        }
        
        // Exponential backoff on errors
        const errorDelay = Math.min(1000 * Math.pow(2, consecutiveErrors), 30000);
        await new Promise(resolve => setTimeout(resolve, errorDelay));
      }
    }
  }

  calculateScanDelay() {
    // Base delay of 3 seconds for flash loan operations
    let delay = 3000;
    
    // Increase delay if we're finding too many opportunities (rate limiting)
    if (this.stats.circularOpportunitiesFound > this.stats.totalScans * 0.05) {
      delay *= 1.5;
    }
    
    // Decrease delay if we haven't found opportunities recently
    if (this.stats.totalScans > 50 && this.stats.circularOpportunitiesFound < this.stats.totalScans * 0.01) {
      delay = Math.max(delay * 0.8, 2000);
    }
    
    return delay;
  }

  async scanForCircularOpportunities() {
    // Get paths for current scan cycle (rotates through all flash loan assets and hop counts)
    const pathsToScan = this.pathGenerator.getPathsForScanCycle(this.currentScanIndex);
    const currentFlashLoanAsset = pathsToScan.length > 0 ? pathsToScan[0].flashLoanAsset : 'UNKNOWN';
    
    // Update scan cycle stats
    if (this.stats.scanCycles[currentFlashLoanAsset] !== undefined) {
      this.stats.scanCycles[currentFlashLoanAsset]++;
    }
    
    // Generate trading pairs for price fetching
    const tradingPairs = this.generateTradingPairs();
    
    // Fetch current prices from all DEXes
    console.log(`📊 Fetching current prices for ${currentFlashLoanAsset} flash loan paths...`);
    const prices = await this.priceFetcher.getAllPrices(tradingPairs, '1');
    
    console.log(`🔍 Scanning ${pathsToScan.length} circular paths for ${currentFlashLoanAsset} arbitrage opportunities...`);
    console.log(`   🔄 Scan cycle: ${this.currentScanIndex}, Asset: ${currentFlashLoanAsset}`);
    
    // Scan paths for opportunities
    const opportunities = await this.scanner.scanMultiplePaths(pathsToScan, 6);
    
    if (opportunities.length > 0) {
      this.stats.circularOpportunitiesFound += opportunities.length;
      
      console.log(`💡 Found ${opportunities.length} circular arbitrage opportunities for ${currentFlashLoanAsset}:`);
      
      // Process each opportunity
      for (const opportunity of opportunities.slice(0, 3)) { // Limit to top 3
        console.log(`   💰 ${opportunity.profitAfterCosts.toFixed(6)} ${opportunity.flashLoanAsset} profit`);
        console.log(`   🔄 Path: ${opportunity.path.join(' → ')}`);
        console.log(`   🏪 DEXes: ${opportunity.dexes.join(' → ')}`);
        console.log(`   📈 Net ROI: ${opportunity.netROI.toFixed(3)}%`);
        console.log(`   ⚠️ Risk: ${opportunity.riskLevel}`);
        
        // Log detailed swap information with USD prices
        await this.logDetailedSwapInfo(opportunity, prices);
        
        // Execute if profitable enough and risk is acceptable
        if (opportunity.netROI.gt(this.config.minProfitPercent) && 
            opportunity.riskLevel !== 'HIGH' &&
            opportunity.confidence > 60) {
          await this.executeFlashLoanArbitrage(opportunity);
        } else {
          console.log(`   ⏭️ Skipping: ROI ${opportunity.netROI.toFixed(3)}% or risk ${opportunity.riskLevel}`);
        }
      }
    } else {
      console.log(`🔍 No profitable circular arbitrage opportunities found for ${currentFlashLoanAsset}`);
    }
  }

  async logDetailedSwapInfo(opportunity, prices) {
    console.log(`   📋 Detailed swap breakdown:`);
    
    for (let i = 0; i < opportunity.swapDetails.length; i++) {
      const swap = opportunity.swapDetails[i];
      const pairKey = `${this.getTokenAddress(swap.from)}/${this.getTokenAddress(swap.to)}`;
      const priceData = prices[pairKey] && prices[pairKey][swap.dex];
      
      let usdInfo = '';
      if (priceData) {
        // Simulate USD conversion (in real implementation, you'd fetch actual USD prices)
        const estimatedUSD = this.estimateUSDValue(swap.from, swap.amountIn);
        usdInfo = ` (~$${estimatedUSD.toFixed(2)})`;
      }
      
      console.log(`     ${i + 1}. ${swap.from} → ${swap.to} on ${swap.dex}`);
      console.log(`        Amount In: ${swap.amountIn.toFixed(6)} ${swap.from}${usdInfo}`);
      console.log(`        Amount Out: ${swap.amountOut.toFixed(6)} ${swap.to}`);
      console.log(`        Price: ${swap.price.toFixed(8)}`);
      console.log(`        Price Impact: ${swap.priceImpact.toFixed(3)}%`);
      console.log(`        Slippage: ${swap.slippage.toFixed(3)}%`);
    }
  }

  estimateUSDValue(token, amount) {
    // Simplified USD estimation - in production, use real price feeds
    const usdPrices = {
      'WBNB': 300,
      'BTCB': 45000,
      'ETH': 2500,
      'USDT': 1,
      'USDC': 1,
      'CAKE': 2.5
    };
    
    const price = usdPrices[token] || 1;
    return amount.multipliedBy(price).toNumber();
  }

  generateTradingPairs() {
    const mainTokens = ['WBNB', 'USDT', 'USDC', 'BTCB', 'ETH', 'CAKE'];
    const pairs = [];
    
    for (let i = 0; i < mainTokens.length; i++) {
      for (let j = i + 1; j < mainTokens.length; j++) {
        pairs.push([
          TOKEN_ADDRESSES[mainTokens[i]].address,
          TOKEN_ADDRESSES[mainTokens[j]].address
        ]);
      }
    }
    
    return pairs;
  }

  async executeFlashLoanArbitrage(opportunity) {
    try {
      console.log('⚡ Executing flash loan arbitrage...');
      
      // Additional safety checks before execution
      if (!await this.performSafetyChecks(opportunity)) {
        console.log('❌ Safety checks failed, skipping execution');
        return;
      }
      
      const result = await this.executor.executeFlashLoanArbitrage(opportunity);
      
      if (result.success) {
        this.stats.flashLoanExecutions++;
        this.stats.totalProfit = this.stats.totalProfit.plus(result.actualProfit);
        
        console.log('✅ Flash loan arbitrage executed successfully!');
        console.log(`💰 Profit: ${result.actualProfit.toFixed(6)} ${opportunity.flashLoanAsset}`);
        console.log(`📝 TX Hash: ${result.txHash}`);
        console.log(`⛽ Gas used: ${result.gasUsed}`);
        console.log(`🔄 Circular path: ${opportunity.path.join(' → ')}`);
      } else {
        console.log('❌ Flash loan arbitrage execution failed:', result.error);
        if (result.reason) {
          console.log(`   Reason: ${result.reason}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error executing flash loan arbitrage:', error.message);
      this.stats.errors++;
    }
  }

  async performSafetyChecks(opportunity) {
    try {
      // Check wallet balance for gas
      const balance = await this.provider.getBalance(this.wallet.address);
      const minBalance = ethers.parseEther('0.005'); // Minimum 0.005 BNB for gas
      
      if (balance < minBalance) {
        console.log('❌ Insufficient balance for gas fees');
        return false;
      }
      
      // Check gas price
      const feeData = await this.provider.getFeeData();
      const maxGasPrice = ethers.parseUnits(this.config.maxGasPrice, 'gwei');
      
      if (feeData.gasPrice > maxGasPrice) {
        console.log('❌ Gas price too high:', ethers.formatUnits(feeData.gasPrice, 'gwei'), 'gwei');
        return false;
      }
      
      // Verify opportunity is still circular
      if (!opportunity.isCircular) {
        console.log('❌ Opportunity is not circular');
        return false;
      }
      
      // Verify flash loan asset consistency
      if (opportunity.flashLoanAsset !== opportunity.path[0] || 
          opportunity.flashLoanAsset !== opportunity.path[opportunity.path.length - 1]) {
        console.log('❌ Flash loan asset mismatch in circular path');
        return false;
      }
      
      // Check minimum profit threshold
      if (opportunity.netROI.lt(this.config.minProfitPercent)) {
        console.log('❌ Profit below minimum threshold');
        return false;
      }
      
      return true;
      
    } catch (error) {
      console.error('❌ Safety check failed:', error.message);
      return false;
    }
  }

  printPathStatistics() {
    const stats = this.pathGenerator.getPathStatistics();
    
    console.log('\n📊 Circular Path Statistics:');
    console.log(`Total circular paths: ${stats.totalPaths}`);
    console.log(`By flash loan asset: ${JSON.stringify(stats.byFlashLoanAsset, null, 2)}`);
    console.log(`By hop count: ${JSON.stringify(stats.byHops, null, 2)}`);
    console.log(`Average liquidity score: ${stats.averageLiquidityScore.toFixed(1)}`);
    console.log(`High quality paths: ${stats.byLiquidityScore.high}`);
  }

  printStats() {
    console.log('\n📊 Flash Loan Arbitrage Bot Statistics:');
    console.log(`Total scans: ${this.stats.totalScans}`);
    console.log(`Circular paths generated: ${this.stats.pathsGenerated}`);
    console.log(`Circular opportunities found: ${this.stats.circularOpportunitiesFound}`);
    console.log(`Flash loan executions: ${this.stats.flashLoanExecutions}`);
    console.log(`Total profit: ${this.stats.totalProfit.toFixed(6)} (various assets)`);
    console.log(`Errors encountered: ${this.stats.errors}`);
    
    console.log('\n🔄 Scan cycles by flash loan asset:');
    for (const [asset, count] of Object.entries(this.stats.scanCycles)) {
      console.log(`  ${asset}: ${count} cycles`);
    }
    
    if (this.stats.circularOpportunitiesFound > 0) {
      console.log(`Execution rate: ${((this.stats.flashLoanExecutions / this.stats.circularOpportunitiesFound) * 100).toFixed(1)}%`);
      console.log(`Opportunity rate: ${((this.stats.circularOpportunitiesFound / this.stats.totalScans) * 100).toFixed(2)}%`);
    }
    
    if (this.stats.flashLoanExecutions > 0) {
      console.log(`Average profit per execution: ${this.stats.totalProfit.div(this.stats.flashLoanExecutions).toFixed(6)}`);
    }
  }

  getTokenAddress(symbol) {
    const token = TOKEN_ADDRESSES[symbol];
    return token ? token.address : symbol;
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Initiating graceful shutdown...');
    this.isRunning = false;
    
    // Clear any pending operations
    this.priceFetcher.clearCache();
    
    // Final stats
    this.printStats();
    
    console.log('✅ Flash loan arbitrage bot shutdown complete');
  }
}

// Example configuration (use environment variables in production)
const CONFIG = {
  rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/',
  privateKey: process.env.PRIVATE_KEY || '0x' + '0'.repeat(64), // NEVER hardcode real keys
  contractAddress: process.env.CONTRACT_ADDRESS || '0x' + '0'.repeat(40),
  minProfitPercent: parseFloat(process.env.MIN_PROFIT_PERCENT) || 0.5, // Minimum 0.5% profit to execute
  maxGasPrice: process.env.MAX_GAS_PRICE || '20', // Max gas price in gwei
  flashLoanAmount: process.env.FLASH_LOAN_AMOUNT || '10' // Default flash loan amount
};

// Main execution
async function main() {
  console.log('🔥 BSC Multi-DEX Flash Loan Arbitrage Bot');
  console.log('⚠️ EDUCATIONAL PURPOSE ONLY - DO NOT USE WITH REAL FUNDS');
  console.log('🔄 Circular arbitrage paths for ALL 6 flash loan assets');
  console.log('=' .repeat(70));
  
  // Validate configuration
  if (CONFIG.privateKey === '0x' + '0'.repeat(64)) {
    console.error('❌ Please set a valid PRIVATE_KEY environment variable');
    console.log('   Example: export PRIVATE_KEY="your_private_key_here"');
    process.exit(1);
  }
  
  if (CONFIG.contractAddress === '0x' + '0'.repeat(40)) {
    console.error('❌ Please set a valid CONTRACT_ADDRESS environment variable');
    console.log('   Deploy the ArbitrageFlashLoan contract first');
    process.exit(1);
  }
  
  const bot = new ArbitrageBot(CONFIG);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received shutdown signal...');
    await bot.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received termination signal...');
    await bot.shutdown();
    process.exit(0);
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    bot.shutdown().then(() => process.exit(1));
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    bot.shutdown().then(() => process.exit(1));
  });
  
  await bot.start();
}

// Run the bot if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export { ArbitrageBot };