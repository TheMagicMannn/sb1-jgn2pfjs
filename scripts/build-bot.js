#!/usr/bin/env node

/**
 * Build script for the arbitrage bot - Netlify compatible
 * Creates a deployable package with both web interface and bot files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

console.log('🤖 Building arbitrage bot for Netlify deployment...');

// Create dist directory
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Clean existing dist
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
}

// Build web interface first
console.log('🌐 Building web interface...');
try {
  const { execSync } = await import('child_process');
  execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });
  
  // Move web build to dist root
  const webBuildDir = path.join(projectRoot, 'dist', 'web');
  if (fs.existsSync(webBuildDir)) {
    const files = fs.readdirSync(webBuildDir);
    files.forEach(file => {
      const srcPath = path.join(webBuildDir, file);
      const destPath = path.join(distDir, file);
      if (fs.statSync(srcPath).isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
    // Remove the web subdirectory
    fs.rmSync(webBuildDir, { recursive: true, force: true });
  }
} catch (error) {
  console.error('❌ Web build failed:', error.message);
  process.exit(1);
}

// Create bot directory structure
const botDistDir = path.join(distDir, 'bot');
const functionsDir = path.join(distDir, 'functions');

fs.mkdirSync(botDistDir, { recursive: true });
fs.mkdirSync(functionsDir, { recursive: true });

// Copy bot source files
const botSrcDir = path.join(projectRoot, 'src', 'bot');
const botDestDir = path.join(botDistDir, 'src', 'bot');

console.log('📁 Copying bot source files...');
copyDirectory(botSrcDir, botDestDir);

// Copy contracts
const contractsSrcDir = path.join(projectRoot, 'contracts');
const contractsDestDir = path.join(botDistDir, 'contracts');

if (fs.existsSync(contractsSrcDir)) {
  console.log('📄 Copying smart contracts...');
  copyDirectory(contractsSrcDir, contractsDestDir);
}

// Copy scripts
const scriptsSrcDir = path.join(projectRoot, 'scripts');
const scriptsDestDir = path.join(botDistDir, 'scripts');

console.log('📜 Copying scripts...');
copyDirectory(scriptsSrcDir, scriptsDestDir);

// Copy configuration files
const configFiles = [
  'hardhat.config.js',
  '.env.example',
  'README.md'
];

console.log('⚙️ Copying configuration files...');
configFiles.forEach(file => {
  const srcPath = path.join(projectRoot, file);
  const destPath = path.join(botDistDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`   ✓ ${file}`);
  }
});

// Create production package.json for bot
const originalPackageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);

const botPackageJson = {
  name: originalPackageJson.name + '-bot',
  version: originalPackageJson.version,
  type: "module",
  main: "src/bot/arbitrageBot.js",
  scripts: {
    start: "node src/bot/arbitrageBot.js",
    compile: "hardhat compile",
    deploy: "hardhat run scripts/deploy.js",
    verify: "hardhat verify"
  },
  dependencies: {
    "ethers": originalPackageJson.dependencies.ethers,
    "web3": originalPackageJson.dependencies.web3,
    "bignumber.js": originalPackageJson.dependencies["bignumber.js"],
    "axios": originalPackageJson.dependencies.axios,
    "ws": originalPackageJson.dependencies.ws,
    "dotenv": originalPackageJson.devDependencies.dotenv
  },
  devDependencies: {
    "@nomicfoundation/hardhat-toolbox": originalPackageJson.devDependencies["@nomicfoundation/hardhat-toolbox"],
    "@nomicfoundation/hardhat-verify": originalPackageJson.devDependencies["@nomicfoundation/hardhat-verify"],
    "@nomicfoundation/hardhat-ethers": originalPackageJson.devDependencies["@nomicfoundation/hardhat-ethers"],
    "@openzeppelin/contracts": originalPackageJson.devDependencies["@openzeppelin/contracts"],
    "@aave/core-v3": originalPackageJson.devDependencies["@aave/core-v3"],
    "hardhat": originalPackageJson.devDependencies.hardhat
  }
};

fs.writeFileSync(
  path.join(botDistDir, 'package.json'),
  JSON.stringify(botPackageJson, null, 2)
);

// Create Netlify function for bot status
const statusFunction = `
import { ArbitrageBot } from '../bot/src/bot/arbitrageBot.js';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Return bot status and configuration
    const status = {
      status: 'ready',
      version: '1.0.0',
      supportedDexes: ['PancakeSwap V2', 'PancakeSwap V3', 'Biswap', 'MDEX', 'Uniswap V3', 'ApeSwap'],
      supportedTokens: ['WBNB', 'BTCB', 'ETH', 'USDT', 'USDC', 'CAKE'],
      network: 'BSC',
      timestamp: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(status)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}
`;

fs.writeFileSync(path.join(functionsDir, 'bot-status.js'), statusFunction);

// Create deployment instructions
const deploymentInstructions = `# BSC Arbitrage Bot - Netlify Deployment

## 🌐 Live Demo
Your arbitrage bot dashboard is now deployed and accessible via Netlify.

## 📁 Deployment Structure
- **Web Interface**: Root directory (/)
- **Bot Files**: /bot/ directory
- **API Functions**: /.netlify/functions/

## 🚀 Getting Started

### 1. Download Bot Files
The complete bot package is available in the \`/bot/\` directory of your deployment.

### 2. Local Setup
\`\`\`bash
# Download the bot directory from your deployment
# Extract to your local machine
cd bot/

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration
\`\`\`

### 3. Deploy Smart Contract
\`\`\`bash
# Compile contracts
npm run compile

# Deploy to BSC testnet
npm run deploy

# Verify on BSCScan
npm run verify
\`\`\`

### 4. Run the Bot
\`\`\`bash
# Start the arbitrage bot
npm start
\`\`\`

## ⚠️ Important Security Notes

1. **Never commit private keys** to version control
2. **Test thoroughly** on BSC testnet before mainnet
3. **Start with small amounts** to verify functionality
4. **Monitor gas prices** and set appropriate limits
5. **Use proper risk management** strategies

## 🔧 Configuration

### Required Environment Variables
\`\`\`env
BSC_RPC_URL=https://bsc-dataseed1.binance.org/
PRIVATE_KEY=your_private_key_here
CONTRACT_ADDRESS=deployed_contract_address
MIN_PROFIT_PERCENT=0.5
MAX_GAS_PRICE=20
\`\`\`

### Optional Settings
\`\`\`env
SCAN_INTERVAL=2000
MAX_CONCURRENT_SCANS=10
LOG_LEVEL=info
BSCSCAN_API_KEY=your_api_key
\`\`\`

## 📊 Monitoring

The web interface provides:
- Real-time opportunity detection
- Trade execution history
- Profit/loss tracking
- Risk assessment metrics
- Live activity logs

## 🆘 Support

For questions or issues:
1. Check the README.md in the bot directory
2. Review the smart contract documentation
3. Test on BSC testnet first
4. Monitor logs for debugging

## ⚖️ Legal Disclaimer

This software is for educational purposes only. Cryptocurrency trading involves substantial risk of loss. Never risk more than you can afford to lose.
`;

fs.writeFileSync(path.join(distDir, 'DEPLOYMENT.md'), deploymentInstructions);

// Create a simple API endpoint info page
const apiInfo = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BSC Arbitrage Bot - API</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { color: #007acc; font-weight: bold; }
    </style>
</head>
<body>
    <h1>BSC Arbitrage Bot API</h1>
    <p>Available API endpoints for the arbitrage bot:</p>
    
    <div class="endpoint">
        <h3><span class="method">GET</span> /.netlify/functions/bot-status</h3>
        <p>Returns the current status and configuration of the arbitrage bot.</p>
        <p><strong>Response:</strong> JSON object with bot status, supported DEXes, and tokens.</p>
    </div>
    
    <h2>Usage Example</h2>
    <pre><code>
fetch('/.netlify/functions/bot-status')
  .then(response => response.json())
  .then(data => console.log(data));
    </code></pre>
    
    <h2>Bot Download</h2>
    <p>The complete bot package is available in the <a href="/bot/">/bot/</a> directory.</p>
    
    <h2>Documentation</h2>
    <p>Full deployment instructions are available in <a href="/DEPLOYMENT.md">DEPLOYMENT.md</a>.</p>
</body>
</html>`;

fs.writeFileSync(path.join(distDir, 'api.html'), apiInfo);

console.log('✅ Bot build completed successfully!');
console.log(`📁 Files built to: ${distDir}`);
console.log('');
console.log('📋 Deployment includes:');
console.log('✓ Web dashboard interface');
console.log('✓ Complete bot source code');
console.log('✓ Smart contracts');
console.log('✓ Deployment scripts');
console.log('✓ API functions');
console.log('✓ Documentation');

/**
 * Recursively copy directory
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}