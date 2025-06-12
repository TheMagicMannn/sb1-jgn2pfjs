# BSC Multi-DEX Arbitrage Bot

A sophisticated arbitrage bot for Binance Smart Chain (BSC) that identifies and executes profitable trades across multiple decentralized exchanges using flash loans. Built with Hardhat for smart contract development and deployment.

## ⚠️ IMPORTANT DISCLAIMER

**This project is for educational purposes only. Do not use with real funds without proper testing and risk management. Cryptocurrency trading involves substantial risk of loss.**

## Features

- **Multi-DEX Support**: Monitors 6 major DEXes on BSC
  - PancakeSwap V2 & V3
  - Biswap
  - MDEX
  - Uniswap V3 (BSC)
  - ApeSwap

- **Flash Loan Integration**: Uses Aave V3 flash loans for capital-efficient arbitrage
- **Real-time Price Monitoring**: Fetches live prices across all supported DEXes
- **Intelligent Path Generation**: Creates optimal arbitrage paths automatically
- **Risk Management**: Built-in safety checks and risk assessment
- **Web Dashboard**: Beautiful React interface for monitoring and control
- **Production-Ready**: Comprehensive testing, deployment, and monitoring tools

## Architecture

### Frontend (React + TypeScript)
- Real-time dashboard showing opportunities and statistics
- Bot control interface (start/stop)
- Live activity logs and performance metrics
- Responsive design with dark theme

### Backend (Node.js)
- **ArbitrageBot**: Main orchestrator
- **PriceFetcher**: Multi-DEX price aggregation
- **PathGenerator**: Arbitrage path discovery
- **ArbitrageScanner**: Opportunity detection and analysis
- **FlashLoanExecutor**: Trade execution via flash loans

### Smart Contract (Solidity)
- **ArbitrageFlashLoan**: Handles flash loan execution
- Multi-DEX router integration
- Gas-optimized swap execution
- Emergency controls and safety features
- Comprehensive access control and security

## Quick Start

### Prerequisites
- Ubuntu 24.04 LTS (recommended)
- Node.js 20+ LTS
- Git
- BSC wallet with BNB for gas fees
- RPC endpoint (Binance, Ankr, or similar)

### Automated Ubuntu Setup

For Ubuntu 24.04, use the automated setup script:

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/your-repo/bsc-arbitrage-bot/main/scripts/setup-ubuntu.sh | bash

# Or clone the repo first and run locally
git clone <repository-url>
cd bsc-arbitrage-bot
chmod +x scripts/setup-ubuntu.sh
./scripts/setup-ubuntu.sh
```

### Manual Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd bsc-arbitrage-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

Required environment variables:
```env
BSC_RPC_URL=https://bsc-dataseed1.binance.org/
PRIVATE_KEY=your_private_key_here
MIN_PROFIT_PERCENT=0.5
MAX_GAS_PRICE=20
BSCSCAN_API_KEY=your_bscscan_api_key
```

4. **Compile smart contracts**
```bash
npm run compile
```

5. **Run tests**
```bash
npm test
```

6. **Deploy smart contract**

For testnet:
```bash
npm run deploy:testnet
```

For mainnet:
```bash
npm run deploy:mainnet
```

7. **Verify contract on BSCScan**
```bash
npm run verify
```

8. **Start the application**

Frontend (development):
```bash
npm run dev
```

Bot (command line):
```bash
npm run bot
```

## Smart Contract Development

### Compilation
```bash
npx hardhat compile
```

### Testing
```bash
npx hardhat test
npx hardhat coverage  # Generate coverage report
```

### Deployment
```bash
# Deploy to BSC testnet
npx hardhat run scripts/deploy.js --network bscTestnet

# Deploy to BSC mainnet
npx hardhat run scripts/deploy.js --network bscMainnet
```

### Verification
```bash
# Verify on BSCScan
npx hardhat verify --network bscMainnet <CONTRACT_ADDRESS> "<CONSTRUCTOR_ARGS>"

# Or use the automated script
npm run verify
```

### Local Development
```bash
# Start local Hardhat node
npx hardhat node

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost
```

## Production Deployment

### Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start the bot with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs bsc-arbitrage-bot

# Restart
pm2 restaqrt bsc-arbitrage-bot
```

### Using Systemd
```bash
# Enable and start the service
sudo systemctl enable arbitrage-bot
sudo systemctl start arbitrage-bot

# Check status
sudo systemctl status arbitrage-bot

# View logs
journalctl -u arbitrage-bot -f
```

## Configuration

### Bot Parameters
- `MIN_PROFIT_PERCENT`: Minimum profit percentage to execute trades (default: 0.5%)
- `MAX_GAS_PRICE`: Maximum gas price in Gwei (default: 20)
- `FLASH_LOAN_AMOUNT`: Default flash loan amount in BNB (default: 10)
- `SCAN_INTERVAL`: Milliseconds between scans (default: 2000)

### Supported Tokens
- WBNB (Wrapped BNB)
- BTCB (Bitcoin BEP2)
- ETH (Ethereum Token)
- USDT (Tether USD)
- USDC (USD Coin)
- CAKE (PancakeSwap Token)

### Network Configuration
```javascript
// hardhat.config.js
networks: {
  bscMainnet: {
    url: process.env.BSC_RPC_URL,
    chainId: 56,
    accounts: [process.env.PRIVATE_KEY]
  },
  bscTestnet: {
    url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
    chainId: 97,
    accounts: [process.env.PRIVATE_KEY]
  }
}
```

## How It Works

1. **Path Generation**: The bot generates all possible arbitrage paths between supported tokens across different DEXes

2. **Price Monitoring**: Continuously fetches real-time prices from all DEX routers

3. **Opportunity Detection**: Analyzes price differences to identify profitable arbitrage opportunities

4. **Risk Assessment**: Evaluates each opportunity for:
   - Price impact
   - Liquidity depth
   - Gas costs
   - Slippage tolerance

5. **Execution**: Uses Aave V3 flash loans to execute profitable trades without requiring upfront capital

6. **Profit Calculation**: Accounts for all fees including:
   - Flash loan fees (0.09%)
   - DEX trading fees (0.1% - 0.3%)
   - Gas costs
   - Slippage

## Safety Features

- **Minimum Balance Checks**: Ensures sufficient BNB for gas fees
- **Gas Price Limits**: Prevents execution during high gas periods
- **Slippage Protection**: Built-in slippage tolerance
- **Emergency Stop**: Immediate bot shutdown capability
- **Rate Limiting**: Prevents overwhelming DEX endpoints
- **Error Handling**: Comprehensive error recovery
- **Access Control**: Multi-level authorization system
- **Pause Functionality**: Contract can be paused in emergencies

## Monitoring & Analytics

The web dashboard provides:
- Real-time opportunity detection
- Trade execution history
- Profit/loss tracking
- Success rate statistics
- Gas usage analytics
- Risk assessment metrics

## Development

### Project Structure
```
├── contracts/              # Smart contracts
│   └── ArbitrageFlashLoan.sol
├── scripts/                # Deployment and utility scripts
│   ├── deploy.js
│   ├── verify.js
│   └── setup-ubuntu.sh
├── test/                   # Contract tests
│   └── ArbitrageFlashLoan.test.js
├── src/
│   ├── App.tsx            # React dashboard
│   ├── bot/               # Bot logic
│   │   ├── arbitrageBot.js
│   │   ├── config/        # DEX and token configurations
│   │   └── utils/         # Core utilities
│   └── components/        # React components
├── hardhat.config.js      # Hardhat configuration
└── package.json
```

### Testing
```bash
# Run all tests
npm test

# Run tests with gas reporting
REPORT_GAS=true npm test

# Generate coverage report
npm run coverage

# Run specific test file
npx hardhat test test/ArbitrageFlashLoan.test.js
```

### Linting and Formatting
```bash
# Lint code
npm run lint

# Format code
npm run format
```

### Building for Production
```bash
npm run build
```

## Security Considerations

### Smart Contract Security
- **Reentrancy Protection**: Uses OpenZeppelin's ReentrancyGuard
- **Access Control**: Comprehensive role-based permissions
- **Pause Mechanism**: Emergency stop functionality
- **Input Validation**: Extensive parameter validation
- **Slippage Protection**: Configurable slippage limits

### Operational Security
- **Private Key Management**: Never hardcode private keys
- **Environment Variables**: Use secure environment configuration
- **Rate Limiting**: Prevent API abuse
- **Monitoring**: Comprehensive logging and alerting
- **Backup Strategy**: Automated backups and recovery

## Risk Warnings

1. **Smart Contract Risk**: Flash loan contracts can have bugs or vulnerabilities
2. **Market Risk**: Crypto markets are highly volatile
3. **Technical Risk**: Network congestion, failed transactions, MEV attacks
4. **Regulatory Risk**: Regulations may change affecting DeFi operations
5. **Impermanent Loss**: Price movements during execution can cause losses

## Best Practices

1. **Start Small**: Test with minimal amounts first
2. **Monitor Closely**: Watch for unusual behavior or errors
3. **Set Conservative Parameters**: Use higher minimum profit thresholds initially
4. **Regular Updates**: Keep dependencies and configurations updated
5. **Backup Strategies**: Have emergency procedures ready
6. **Test Thoroughly**: Always test on testnet before mainnet

## Troubleshooting

### Common Issues

**Contract Deployment Fails**
```bash
# Check network configuration
npx hardhat run scripts/deploy.js --network bscTestnet

# Verify gas settings
# Ensure sufficient balance
```

**Bot Not Finding Opportunities**
```bash
# Check RPC connection
# Verify DEX configurations
# Adjust profit thresholds
```

**High Gas Costs**
```bash
# Adjust MAX_GAS_PRICE
# Optimize transaction timing
# Use gas estimation tools
```

### Logs and Debugging
```bash
# View PM2 logs
pm2 logs bsc-arbitrage-bot

# View systemd logs
journalctl -u arbitrage-bot -f

# Enable debug mode
DEBUG=true npm run bot
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues:
1. Check the documentation
2. Review existing GitHub issues
3. Create a new issue with detailed information

## Acknowledgments

- Aave Protocol for flash loan infrastructure
- PancakeSwap and other DEXes for liquidity
- OpenZeppelin for smart contract libraries
- Hardhat for development framework
- The DeFi community for inspiration and tools

---

**Remember: This is educational software. Never risk more than you can afford to lose.**