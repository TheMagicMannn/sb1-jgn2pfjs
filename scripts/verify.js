import { run } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 Starting contract verification...");
  
  // Get the latest deployment file
  const deploymentsDir = path.join(process.cwd(), "deployments");
  
  if (!fs.existsSync(deploymentsDir)) {
    throw new Error("❌ No deployments directory found. Deploy the contract first.");
  }
  
  const deploymentFiles = fs.readdirSync(deploymentsDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => {
      const aTime = fs.statSync(path.join(deploymentsDir, a)).mtime;
      const bTime = fs.statSync(path.join(deploymentsDir, b)).mtime;
      return bTime - aTime;
    });
  
  if (deploymentFiles.length === 0) {
    throw new Error("❌ No deployment files found. Deploy the contract first.");
  }
  
  const latestDeployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, deploymentFiles[0]), 'utf8')
  );
  
  console.log(`📄 Using deployment: ${deploymentFiles[0]}`);
  console.log(`📍 Contract address: ${latestDeployment.contractAddress}`);
  console.log(`🌐 Network: ${latestDeployment.network}`);
  
  try {
    await run("verify:verify", {
      address: latestDeployment.contractAddress,
      constructorArguments: [latestDeployment.aaveAddressProvider],
    });
    
    console.log("✅ Contract verification completed successfully!");
    
  } catch (error) {
    if (error.message.toLowerCase().includes("already verified")) {
      console.log("✅ Contract is already verified!");
    } else {
      console.error("❌ Verification failed:", error.message);
      throw error;
    }
  }
}

main()
  .then(() => {
    console.log("🎉 Verification script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Verification script failed:", error);
    process.exit(1);
  });