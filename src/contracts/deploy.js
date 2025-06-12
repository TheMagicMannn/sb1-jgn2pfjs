/**
 * Deployment script for ArbitrageFlashLoan contract
 * 
 * IMPORTANT: This is for educational purposes only.
 * Always test thoroughly on testnets before mainnet deployment.
 */

import { ethers } from 'ethers';
import fs from 'fs';

// BSC Mainnet configuration
const BSC_CONFIG = {
  rpcUrl: 'https://bsc-dataseed1.binance.org/',
  chainId: 56,
  name: 'BSC Mainnet',
  aaveAddressProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb' // Aave V3 on BSC
};

// BSC Testnet configuration
const BSC_TESTNET_CONFIG = {
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  chainId: 97,
  name: 'BSC Testnet',
  aaveAddressProvider: '0x5343b5bA672Af8d0F8c54a1C8E3e2Db2F9E73a8b' // Aave V3 on BSC Testnet
};

class ContractDeployer {
  constructor(network = 'testnet') {
    this.config = network === 'mainnet' ? BSC_CONFIG : BSC_TESTNET_CONFIG;
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
  }

  async deploy(privateKey) {
    try {
      console.log(`🚀 Deploying to ${this.config.name}...`);
      console.log(`📡 RPC URL: ${this.config.rpcUrl}`);
      
      // Create wallet
      const wallet = new ethers.Wallet(privateKey, this.provider);
      console.log(`👤 Deployer address: ${wallet.address}`);
      
      // Check balance
      const balance = await this.provider.getBalance(wallet.address);
      console.log(`💰 Balance: ${ethers.formatEther(balance)} BNB`);
      
      if (balance < ethers.parseEther('0.1')) {
        throw new Error('Insufficient balance for deployment (need at least 0.1 BNB)');
      }
      
      // Load contract
      const contractSource = this.loadContractSource();
      const { abi, bytecode } = await this.compileContract(contractSource);
      
      // Create contract factory
      const factory = new ethers.ContractFactory(abi, bytecode, wallet);
      
      // Deploy contract
      console.log('📦 Deploying contract...');
      const contract = await factory.deploy(this.config.aaveAddressProvider, {
        gasLimit: 3000000,
        gasPrice: ethers.parseUnits('5', 'gwei')
      });
      
      console.log(`⏳ Waiting for deployment... TX: ${contract.deploymentTransaction().hash}`);
      await contract.waitForDeployment();
      
      const address = await contract.getAddress();
      console.log(`✅ Contract deployed at: ${address}`);
      
      // Verify deployment
      await this.verifyDeployment(contract);
      
      // Save deployment info
      this.saveDeploymentInfo(address, contract.deploymentTransaction().hash);
      
      return {
        address,
        txHash: contract.deploymentTransaction().hash,
        abi
      };
      
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  loadContractSource() {
    try {
      return fs.readFileSync('./src/contracts/ArbitrageFlashLoan.sol', 'utf8');
    } catch (error) {
      throw new Error('Contract source file not found');
    }
  }

  async compileContract(source) {
    // This is a simplified compilation process
    // In production, use proper Solidity compiler
    console.log('🔨 Compiling contract...');
    
    // For demonstration - in real deployment you'd use:
    // - solc compiler
    // - Hardhat
    // - Truffle
    // - Remix
    
    throw new Error('Contract compilation not implemented in this demo. Use Remix or Hardhat for real deployment.');
  }

  async verifyDeployment(contract) {
    console.log('🔍 Verifying deployment...');
    
    // Check if contract is deployed
    const code = await this.provider.getCode(await contract.getAddress());
    if (code === '0x') {
      throw new Error('Contract deployment failed - no code at address');
    }
    
    // Test basic functions
    try {
      const owner = await contract.owner();
      console.log(`👤 Contract owner: ${owner}`);
      
      const dexConfig = await contract.getDexConfig(0);
      console.log(`🔧 DEX 0 config: ${dexConfig[0]}`);
      
      console.log('✅ Contract verification passed');
    } catch (error) {
      console.warn('⚠️ Contract verification failed:', error.message);
    }
  }

  saveDeploymentInfo(address, txHash) {
    const deploymentInfo = {
      network: this.config.name,
      chainId: this.config.chainId,
      address: address,
      txHash: txHash,
      timestamp: new Date().toISOString(),
      aaveAddressProvider: this.config.aaveAddressProvider
    };
    
    const filename = `deployment-${this.config.chainId}-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log(`📄 Deployment info saved to: ${filename}`);
  }

  async estimateDeploymentCost(privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      
      // Estimate gas for deployment
      // This is simplified - real estimation would compile the contract first
      const estimatedGas = 2500000;
      const gasPrice = await this.provider.getFeeData();
      
      const cost = BigInt(estimatedGas) * gasPrice.gasPrice;
      
      console.log('💰 Deployment Cost Estimation:');
      console.log(`   Gas Limit: ${estimatedGas.toLocaleString()}`);
      console.log(`   Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} Gwei`);
      console.log(`   Total Cost: ${ethers.formatEther(cost)} BNB`);
      
      return {
        gasLimit: estimatedGas,
        gasPrice: gasPrice.gasPrice,
        totalCost: cost
      };
      
    } catch (error) {
      console.error('❌ Cost estimation failed:', error.message);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const network = args[1] || 'testnet';
  
  if (!command) {
    console.log('Usage:');
    console.log('  node deploy.js deploy [testnet|mainnet]');
    console.log('  node deploy.js estimate [testnet|mainnet]');
    return;
  }
  
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Please set PRIVATE_KEY environment variable');
    return;
  }
  
  const deployer = new ContractDeployer(network);
  
  switch (command) {
    case 'deploy':
      await deployer.deploy(privateKey);
      break;
      
    case 'estimate':
      await deployer.estimateDeploymentCost(privateKey);
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ContractDeployer };