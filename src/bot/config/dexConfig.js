/**
 * DEX Configuration for BSC Multi-DEX Arbitrage
 * Contains router addresses, factory addresses, and fee structures for supported DEXes
 */

export const DEX_CONFIGS = {
  PANCAKESWAP_V2: {
    name: 'PancakeSwap V2',
    type: 'UniswapV2',
    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    fee: 0.0025, // 0.25%
    initCodeHash: '0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5'
  },
  
  PANCAKESWAP_V3: {
    name: 'PancakeSwap V3',
    type: 'UniswapV3',
    router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    fees: [100, 500, 2500, 10000] // 0.01%, 0.05%, 0.25%, 1%
  },
  
  BISWAP: {
    name: 'Biswap',
    type: 'UniswapV2',
    router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
    factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
    fee: 0.001, // 0.1%
    initCodeHash: '0xfea293c909d87cd4153593f077b76bb7e94340200f4ee84211ae8e4f9bd7ffdf'
  },
  
  MDEX: {
    name: 'MDEX',
    type: 'UniswapV2',
    router: '0x7DAe51BD3E3376B8c7c4900E9107f12Be3AF1bA8',
    factory: '0x3CD1C46068dAEa5Ebb0d3f55F6915B10648062B8',
    fee: 0.003, // 0.3%
    initCodeHash: '0x0d994d996174b05cfc7bed897dc1b20b4c458fc8d64fe98bc78b3c64a6b4d093'
  },
  
  UNISWAP_V3: {
    name: 'Uniswap V3',
    type: 'UniswapV3',
    router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
    quoter: '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
    fees: [100, 500, 3000, 10000] // 0.01%, 0.05%, 0.3%, 1%
  },
  
  APESWAP: {
    name: 'ApeSwap',
    type: 'UniswapV2',
    router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
    factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
    fee: 0.002, // 0.2%
    initCodeHash: '0xf4ccce374816856d11f00e4069e7cada164065686fbef53c6167a63ec2fd8c5b'
  }
};

// ABI fragments for router contracts
export const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapTokensForExactTokens(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// ABI fragments for factory contracts
export const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint) external view returns (address pair)',
  'function allPairsLength() external view returns (uint)'
];

// ABI fragments for pair contracts
export const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint)',
  'function kLast() external view returns (uint)'
];

// Uniswap V3 specific ABIs
export const QUOTER_V3_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
  'function quoteExactInput(bytes calldata path, uint256 amountIn) external returns (uint256 amountOut)'
];