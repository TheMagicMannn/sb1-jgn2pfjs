import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Starting deployment process...");
  
  // Get network information
  const network = await ethers.provider.getNetwork();
  console.log(`📡 Deploying to network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deploying with account: ${deployer.address}`);
  
  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Account balance: ${ethers.formatEther(balance)} BNB`);
  
  if (balance < ethers.parseEther("0.1")) {
    throw new Error("❌ Insufficient balance for deployment (need at least 0.1 BNB)");
  }
  
  // Network-specific configurations
  const networkConfigs = {
    56: { // BSC Mainnet
      name: "BSC Mainnet",
      aaveAddressProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb"
    },
    97: { // BSC Testnet
      name: "BSC Testnet", 
      aaveAddressProvider: "0x5343b5bA672Af8d0F8c54a1C8E3e2Db2F9E73a8b"
    },
    1337: { // Hardhat local
      name: "Hardhat Local",
      aaveAddressProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb" // Fork from mainnet
    }
  };
  
  const config = networkConfigs[Number(network.chainId)];
  if (!config) {
    throw new Error(`❌ Unsupported network: ${network.chainId}`);
  }
  
  console.log(`🔧 Using Aave Address Provider: ${config.aaveAddressProvider}`);
  
  // Deploy the contract
  console.log("📦 Deploying ArbitrageFlashLoan contract...");
  
  const ArbitrageFlashLoan = await ethers.getContractFactory("ArbitrageFlashLoan");
  const arbitrageContract = await ArbitrageFlashLoan.deploy(
    config.aaveAddressProvider,
    {
      gasLimit: 3000000,
    }
  );
  
  await arbitrageContract.waitForDeployment();
  const contractAddress = await arbitrageContract.getAddress();
  
  console.log(`✅ ArbitrageFlashLoan deployed to: ${contractAddress}`);
  console.log(`📝 Transaction hash: ${arbitrageContract.deploymentTransaction()?.hash}`);
  
  // Verify deployment
  console.log("🔍 Verifying deployment...");
  
  try {
    const owner = await arbitrageContract.owner();
    console.log(`👤 Contract owner: ${owner}`);
    
    const [router, dexType, isActive] = await arbitrageContract.getDexConfig(0);
    console.log(`🔧 DEX 0 config - Router: ${router}, Type: ${dexType}, Active: ${isActive}`);
    
    const stats = await arbitrageContract.getStatistics();
    console.log(`📊 Initial stats - Arbitrages: ${stats[0]}, Profit: ${stats[1]}`);
    
    console.log("✅ Contract verification passed");
  } catch (error) {
    console.warn("⚠️ Contract verification failed:", error.message);
  }
  
  // Save deployment information
  const deploymentInfo = {
    network: config.name,
    chainId: Number(network.chainId),
    contractAddress: contractAddress,
    deployerAddress: deployer.address,
    aaveAddressProvider: config.aaveAddressProvider,
    transactionHash: arbitrageContract.deploymentTransaction()?.hash,
    blockNumber: arbitrageContract.deploymentTransaction()?.blockNumber,
    gasUsed: arbitrageContract.deploymentTransaction()?.gasLimit?.toString(),
    timestamp: new Date().toISOString(),
    contractABI: ArbitrageFlashLoan.interface.formatJson()
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment info
  const filename = path.join(deploymentsDir, `${config.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log(`📄 Deployment info saved to: ${filename}`);
  
  // Update .env file with contract address
  const envPath = path.join(process.cwd(), ".env");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }
  
  // Update or add CONTRACT_ADDRESS
  const contractAddressRegex = /^CONTRACT_ADDRESS=.*$/m;
  const newContractAddressLine = `CONTRACT_ADDRESS=${contractAddress}`;
  
  if (contractAddressRegex.test(envContent)) {
    envContent = envContent.replace(contractAddressRegex, newContractAddressLine);
  } else {
    envContent += `\n${newContractAddressLine}\n`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log(`📝 Updated .env file with contract address`);
  
  // Display next steps
  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📋 Next Steps:");
  console.log("1. Update your bot configuration with the new contract address");
  console.log("2. Fund the deployer account with BNB for gas fees");
  console.log("3. Test the arbitrage bot on testnet first");
  console.log("4. Consider verifying the contract on BSCScan");
  
  if (Number(network.chainId) === 56 || Number(network.chainId) === 97) {
    console.log(`\n🔍 Verify contract on BSCScan:`);
    console.log(`npx hardhat verify --network ${network.name === "unknown" ? "bscMainnet" : "bscTestnet"} ${contractAddress} "${config.aaveAddressProvider}"`);
  }
  
  return {
    contractAddress,
    deploymentInfo
  };
}

// Handle errors and run deployment
main()
  .then((result) => {
    console.log("\n✅ Deployment script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });