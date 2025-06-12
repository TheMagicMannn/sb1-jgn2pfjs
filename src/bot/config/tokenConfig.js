/**
 * Token Configuration for BSC Network
 * Contains addresses and metadata for supported flash loan assets
 */

export const TOKEN_ADDRESSES = {
  WBNB: {
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    symbol: 'WBNB',
    name: 'Wrapped BNB',
    decimals: 18,
    isNative: true
  },
  
  BTCB: {
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    symbol: 'BTCB',
    name: 'Bitcoin BEP2',
    decimals: 18,
    isStable: false
  },
  
  ETH: {
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    symbol: 'ETH',
    name: 'Ethereum Token',
    decimals: 18,
    isStable: false
  },
  
  USDT: {
    address: '0x55d398326f99059fF775485246999027B3197955',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 18,
    isStable: true
  },
  
  USDC: {
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 18,
    isStable: true
  },
  
  CAKE: {
    address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    symbol: 'CAKE',
    name: 'PancakeSwap Token',
    decimals: 18,
    isStable: false
  }
};

// Common trading pairs for each token
export const TRADING_PAIRS = {
  WBNB: ['USDT', 'USDC', 'BTCB', 'ETH', 'CAKE'],
  BTCB: ['WBNB', 'USDT', 'USDC', 'ETH'],
  ETH: ['WBNB', 'USDT', 'USDC', 'BTCB'],
  USDT: ['WBNB', 'BTCB', 'ETH', 'USDC', 'CAKE'],
  USDC: ['WBNB', 'BTCB', 'ETH', 'USDT', 'CAKE'],
  CAKE: ['WBNB', 'USDT', 'USDC']
};

// Minimum liquidity thresholds (in USD) for considering pairs
export const MIN_LIQUIDITY_THRESHOLDS = {
  WBNB: 50000,   // $50k minimum liquidity
  BTCB: 100000,  // $100k minimum liquidity
  ETH: 75000,    // $75k minimum liquidity
  USDT: 25000,   // $25k minimum liquidity
  USDC: 25000,   // $25k minimum liquidity
  CAKE: 25000    // $25k minimum liquidity
};

// Gas costs for different token types (in gas units)
export const TOKEN_GAS_COSTS = {
  NATIVE: 21000,     // Native BNB transfers
  BEP20: 45000,      // Standard BEP20 transfers
  COMPLEX: 65000     // Tokens with additional logic
};

// Price impact thresholds (percentage)
export const PRICE_IMPACT_THRESHOLDS = {
  LOW: 0.1,      // 0.1% - preferred
  MEDIUM: 0.5,   // 0.5% - acceptable
  HIGH: 1.0,     // 1.0% - risky
  EXTREME: 2.0   // 2.0% - avoid
};

// Helper function to get token by address
export function getTokenByAddress(address) {
  return Object.values(TOKEN_ADDRESSES).find(
    token => token.address.toLowerCase() === address.toLowerCase()
  );
}

// Helper function to get token symbol by address
export function getTokenSymbol(address) {
  const token = getTokenByAddress(address);
  return token ? token.symbol : 'UNKNOWN';
}

// Helper function to check if token is stablecoin
export function isStablecoin(symbol) {
  const token = TOKEN_ADDRESSES[symbol];
  return token ? token.isStable : false;
}

// Helper function to get all token addresses as array
export function getAllTokenAddresses() {
  return Object.values(TOKEN_ADDRESSES).map(token => token.address);
}

// ERC20 ABI for token interactions
export const ERC20_ABI = [
  'function name() public view returns (string)',
  'function symbol() public view returns (string)',
  'function decimals() public view returns (uint8)',
  'function totalSupply() public view returns (uint256)',
  'function balanceOf(address _owner) public view returns (uint256 balance)',
  'function transfer(address _to, uint256 _value) public returns (bool success)',
  'function transferFrom(address _from, address _to, uint256 _value) public returns (bool success)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',
  'function allowance(address _owner, address _spender) public view returns (uint256 remaining)'
];