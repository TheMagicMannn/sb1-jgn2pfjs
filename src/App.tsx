import React, { useState, useEffect } from 'react';
import { Play, Pause, TrendingUp, DollarSign, Activity, AlertTriangle, RotateCcw, Zap } from 'lucide-react';

interface SwapDetail {
  index: number;
  from: string;
  to: string;
  dex: string;
  amountIn: number;
  amountOut: number;
  price: number;
  priceImpact: number;
  slippage: number;
  usdValue: number;
}

interface ArbitrageOpportunity {
  id: string;
  flashLoanAsset: string;
  path: string[];
  dexes: string[];
  expectedProfit: string;
  profitPercent: number;
  gasEstimate: string;
  swapDetails: SwapDetail[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  hops: number;
}

interface BotStats {
  totalTrades: number;
  successfulTrades: number;
  totalProfit: string;
  runningTime: string;
  isActive: boolean;
  scanCycles: {
    WBNB: number;
    BTCB: number;
    ETH: number;
    USDT: number;
    USDC: number;
    CAKE: number;
  };
  currentFlashLoanAsset: string;
  pathsGenerated: number;
}

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [botStats, setBotStats] = useState<BotStats>({
    totalTrades: 0,
    successfulTrades: 0,
    totalProfit: '0.00',
    runningTime: '00:00:00',
    isActive: false,
    scanCycles: {
      WBNB: 0,
      BTCB: 0,
      ETH: 0,
      USDT: 0,
      USDC: 0,
      CAKE: 0
    },
    currentFlashLoanAsset: 'WBNB',
    pathsGenerated: 1200
  });

  const [logs, setLogs] = useState<string[]>([
    'Bot initialized - Ready to scan for circular arbitrage opportunities',
    'Connected to BSC network',
    'Generated 1,200 circular paths across all 6 flash loan assets',
    'Monitoring 6 DEXes: PancakeSwap V2/V3, Biswap, MDEX, Uniswap V3, ApeSwap'
  ]);

  const [currentScanCycle, setCurrentScanCycle] = useState(0);

  // Mock USD prices for demonstration
  const usdPrices = {
    'WBNB': 300,
    'BTCB': 45000,
    'ETH': 2500,
    'USDT': 1,
    'USDC': 1,
    'CAKE': 2.5
  };

  const flashLoanAssets = ['WBNB', 'BTCB', 'ETH', 'USDT', 'USDC', 'CAKE'];

  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      if (isRunning) {
        // Cycle through flash loan assets
        const currentAsset = flashLoanAssets[currentScanCycle % flashLoanAssets.length];
        const hopCount = Math.floor(Math.random() * 9) + 2; // 2-10 hops
        
        setBotStats(prev => ({
          ...prev,
          currentFlashLoanAsset: currentAsset,
          scanCycles: {
            ...prev.scanCycles,
            [currentAsset]: prev.scanCycles[currentAsset] + 1
          }
        }));

        // Generate realistic swap details
        const generateSwapDetails = (path: string[], dexes: string[]): SwapDetail[] => {
          const details: SwapDetail[] = [];
          let currentAmount = 10; // Starting amount
          
          for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const dex = dexes[i];
            
            // Simulate price calculation with some randomness
            const basePrice = (usdPrices[to] || 1) / (usdPrices[from] || 1);
            const priceVariation = 0.95 + Math.random() * 0.1; // ±5% variation
            const price = basePrice * priceVariation;
            const amountOut = currentAmount * price * (0.997 - Math.random() * 0.002); // Account for fees
            
            details.push({
              index: i,
              from,
              to,
              dex,
              amountIn: currentAmount,
              amountOut,
              price,
              priceImpact: Math.random() * 1.5,
              slippage: Math.random() * 0.5,
              usdValue: currentAmount * (usdPrices[from] || 1)
            });
            
            currentAmount = amountOut;
          }
          
          return details;
        };

        // Simulate finding opportunities with detailed swap information
        if (Math.random() > 0.7) { // 30% chance of finding opportunity
          const pathLength = hopCount + 1; // +1 because path includes start and end
          const path = [currentAsset];
          const dexes = [];
          
          // Generate a realistic circular path
          const availableTokens = flashLoanAssets.filter(t => t !== currentAsset);
          for (let i = 0; i < hopCount - 1; i++) {
            const nextToken = availableTokens[Math.floor(Math.random() * availableTokens.length)];
            path.push(nextToken);
            dexes.push(['PancakeSwap V2', 'PancakeSwap V3', 'Biswap', 'MDEX', 'Uniswap V3', 'ApeSwap'][Math.floor(Math.random() * 6)]);
          }
          path.push(currentAsset); // Complete the circle
          dexes.push(['PancakeSwap V2', 'PancakeSwap V3', 'Biswap', 'MDEX', 'Uniswap V3', 'ApeSwap'][Math.floor(Math.random() * 6)]);

          const swapDetails = generateSwapDetails(path, dexes);
          const profit = (Math.random() * 0.08 + 0.01).toFixed(4);
          const profitPercent = parseFloat(profit) * 10;

          const mockOpportunity: ArbitrageOpportunity = {
            id: `arb_${Date.now()}`,
            flashLoanAsset: currentAsset,
            path,
            dexes,
            expectedProfit: profit,
            profitPercent,
            gasEstimate: '0.003',
            swapDetails,
            riskLevel: profitPercent > 0.5 ? 'LOW' : profitPercent > 0.3 ? 'MEDIUM' : 'HIGH',
            confidence: Math.floor(Math.random() * 40) + 60,
            hops: hopCount
          };

          setOpportunities(prev => [mockOpportunity, ...prev.slice(0, 4)]);
          
          const newLog = `🔄 ${currentAsset} circular arbitrage: ${profit} ${currentAsset} profit (${profitPercent.toFixed(2)}%) - ${hopCount} hops`;
          setLogs(prev => [newLog, ...prev.slice(0, 9)]);
        } else {
          const newLog = `🔍 Scanning ${currentAsset} paths (${hopCount}-hop) - No profitable opportunities found`;
          setLogs(prev => [newLog, ...prev.slice(0, 9)]);
        }

        setCurrentScanCycle(prev => prev + 1);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isRunning, currentScanCycle]);

  const toggleBot = () => {
    setIsRunning(!isRunning);
    setBotStats(prev => ({ ...prev, isActive: !isRunning }));
    
    if (!isRunning) {
      setLogs(prev => ['🚀 Bot started - Scanning circular arbitrage paths across all flash loan assets...', ...prev]);
    } else {
      setLogs(prev => ['⏸️ Bot stopped', ...prev]);
    }
  };

  const supportedDexes = ['PancakeSwap V2', 'PancakeSwap V3', 'Biswap', 'MDEX', 'Uniswap V3', 'ApeSwap'];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'HIGH': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <TrendingUp className="w-8 h-8 text-green-400" />
            <div>
              <h1 className="text-2xl font-bold">BSC Multi-Asset Flash Loan Arbitrage</h1>
              <p className="text-gray-400 text-sm">Circular arbitrage across 6 flash loan assets</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">Current Asset</p>
              <p className="font-semibold text-blue-400">{botStats.currentFlashLoanAsset}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Network</p>
              <p className="font-semibold">BSC Mainnet</p>
            </div>
            <button
              onClick={toggleBot}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                isRunning 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>{isRunning ? 'Stop Bot' : 'Start Bot'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Paths</p>
                <p className="text-2xl font-bold">{botStats.pathsGenerated.toLocaleString()}</p>
              </div>
              <RotateCcw className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Flash Loan Executions</p>
                <p className="text-2xl font-bold">{botStats.totalTrades}</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Profit</p>
                <p className="text-2xl font-bold text-green-400">{botStats.totalProfit} Multi</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Status</p>
                <p className={`text-2xl font-bold ${isRunning ? 'text-green-400' : 'text-gray-400'}`}>
                  {isRunning ? 'Active' : 'Stopped'}
                </p>
              </div>
              <div className={`w-4 h-4 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
            </div>
          </div>
        </div>

        {/* Flash Loan Asset Scan Cycles */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-lg font-semibold mb-4">Flash Loan Asset Scan Cycles</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {flashLoanAssets.map((asset) => (
              <div key={asset} className={`p-3 rounded-lg border ${
                botStats.currentFlashLoanAsset === asset 
                  ? 'border-blue-500 bg-blue-900/20' 
                  : 'border-gray-600 bg-gray-700'
              }`}>
                <div className="text-center">
                  <p className="font-semibold">{asset}</p>
                  <p className="text-2xl font-bold text-blue-400">{botStats.scanCycles[asset]}</p>
                  <p className="text-xs text-gray-400">cycles</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warning Banner */}
        <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-200">Educational Demo Only</h3>
              <p className="text-yellow-300 text-sm">
                This demonstrates circular arbitrage across all 6 flash loan assets with real-time USD pricing. 
                Do not use with real funds without proper testing and risk management.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Arbitrage Opportunities */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold">Live Circular Arbitrage Opportunities</h2>
              <p className="text-gray-400 text-sm">Real-time scanning with USD pricing across all flash loan assets</p>
            </div>
            
            <div className="p-4">
              {opportunities.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Scanning for circular opportunities...</p>
                  <p className="text-sm">Cycling through {flashLoanAssets.join(', ')} flash loan assets</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {opportunities.map((opp) => (
                    <div key={opp.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="font-semibold text-blue-400">{opp.flashLoanAsset} Flash Loan</span>
                          <span className="text-green-400 font-semibold">+{opp.expectedProfit} {opp.flashLoanAsset}</span>
                          <span className="text-green-400 text-sm">({opp.profitPercent.toFixed(2)}%)</span>
                          <span className={`text-xs px-2 py-1 rounded ${getRiskColor(opp.riskLevel)} bg-gray-800`}>
                            {opp.riskLevel} RISK
                          </span>
                        </div>
                        <button className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm font-semibold transition-colors">
                          Execute
                        </button>
                      </div>
                      
                      <div className="text-sm text-gray-400 mb-3">
                        <p>🔄 Circular Path ({opp.hops} hops): {opp.path.join(' → ')}</p>
                        <p>🏪 DEXes: {opp.dexes.join(' → ')}</p>
                        <p>⛽ Gas: ~{opp.gasEstimate} BNB | 🎯 Confidence: {opp.confidence}%</p>
                      </div>

                      {/* Detailed Swap Information */}
                      <div className="bg-gray-800 rounded p-3 mt-3">
                        <h4 className="text-sm font-semibold mb-2 text-gray-300">Swap Details with USD Pricing:</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {opp.swapDetails.map((swap, index) => (
                            <div key={index} className="text-xs text-gray-400 border-l-2 border-blue-500 pl-2">
                              <div className="flex justify-between items-center">
                                <span className="font-medium">
                                  {swap.from} → {swap.to} on {swap.dex}
                                </span>
                                <span className="text-green-400">
                                  {formatUSD(swap.usdValue)}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span>In: {swap.amountIn.toFixed(4)} {swap.from}</span>
                                <span>Out: {swap.amountOut.toFixed(4)} {swap.to}</span>
                                <span>Impact: {swap.priceImpact.toFixed(2)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Configuration & Logs */}
          <div className="space-y-6">
            {/* Flash Loan Assets */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-semibold">Flash Loan Assets</h3>
                <p className="text-sm text-gray-400">All 6 assets supported</p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  {flashLoanAssets.map((token) => (
                    <div key={token} className={`px-3 py-2 rounded text-center text-sm font-semibold ${
                      botStats.currentFlashLoanAsset === token 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {token}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DEX Coverage */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-semibold">DEX Coverage</h3>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {supportedDexes.map((dex) => (
                    <div key={dex} className="flex items-center justify-between">
                      <span className="text-sm">{dex}</span>
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Activity Logs */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-semibold">Activity Log</h3>
              </div>
              <div className="p-4">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {logs.map((log, index) => (
                    <div key={index} className="text-sm text-gray-300 font-mono">
                      <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;