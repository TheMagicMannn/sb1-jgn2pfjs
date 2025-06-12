import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ArbitrageFlashLoan", function () {
  // Fixture for deploying the contract
  async function deployArbitrageFlashLoanFixture() {
    const [owner, executor, user] = await ethers.getSigners();
    
    // Mock Aave Address Provider for testing
    const mockAddressProvider = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
    
    const ArbitrageFlashLoan = await ethers.getContractFactory("ArbitrageFlashLoan");
    const arbitrageContract = await ArbitrageFlashLoan.deploy(mockAddressProvider);
    
    return { arbitrageContract, owner, executor, user, mockAddressProvider };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial configuration", async function () {
      const { arbitrageContract, owner } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      expect(await arbitrageContract.owner()).to.equal(owner.address);
      expect(await arbitrageContract.isAuthorizedExecutor(owner.address)).to.be.true;
      expect(await arbitrageContract.totalArbitrages()).to.equal(0);
      expect(await arbitrageContract.totalProfit()).to.equal(0);
    });

    it("Should initialize DEX configurations correctly", async function () {
      const { arbitrageContract } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      // Check PancakeSwap V2 configuration (DEX ID 0)
      const [router, dexType, isActive, maxSlippage] = await arbitrageContract.getDexConfig(0);
      
      expect(router).to.equal("0x10ED43C718714eb63d5aA57B78B54704E256024E");
      expect(dexType).to.equal(0); // UniswapV2 type
      expect(isActive).to.be.true;
      expect(maxSlippage).to.equal(300); // 3%
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to set authorized executors", async function () {
      const { arbitrageContract, owner, executor } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      expect(await arbitrageContract.isAuthorizedExecutor(executor.address)).to.be.false;
      
      await arbitrageContract.connect(owner).setAuthorizedExecutor(executor.address, true);
      
      expect(await arbitrageContract.isAuthorizedExecutor(executor.address)).to.be.true;
    });

    it("Should not allow non-owner to set authorized executors", async function () {
      const { arbitrageContract, executor, user } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      await expect(
        arbitrageContract.connect(user).setAuthorizedExecutor(executor.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("DEX Configuration", function () {
    it("Should allow owner to update DEX configuration", async function () {
      const { arbitrageContract, owner } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      const newRouter = "0x1234567890123456789012345678901234567890";
      const newDexType = 1;
      const newIsActive = false;
      const newMaxSlippage = 500;
      
      await arbitrageContract.connect(owner).setDexConfig(
        0, // DEX ID
        newRouter,
        newDexType,
        newIsActive,
        newMaxSlippage
      );
      
      const [router, dexType, isActive, maxSlippage] = await arbitrageContract.getDexConfig(0);
      
      expect(router).to.equal(newRouter);
      expect(dexType).to.equal(newDexType);
      expect(isActive).to.equal(newIsActive);
      expect(maxSlippage).to.equal(newMaxSlippage);
    });

    it("Should not allow setting invalid router address", async function () {
      const { arbitrageContract, owner } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      await expect(
        arbitrageContract.connect(owner).setDexConfig(
          0,
          ethers.ZeroAddress,
          0,
          true,
          300
        )
      ).to.be.revertedWith("ArbitrageFlashLoan: Invalid router address");
    });

    it("Should not allow setting slippage above maximum", async function () {
      const { arbitrageContract, owner } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      await expect(
        arbitrageContract.connect(owner).setDexConfig(
          0,
          "0x1234567890123456789012345678901234567890",
          0,
          true,
          1500 // 15% - above MAX_SLIPPAGE (10%)
        )
      ).to.be.revertedWith("ArbitrageFlashLoan: Slippage too high");
    });
  });

  describe("Pause Functionality", function () {
    it("Should allow owner to pause and unpause", async function () {
      const { arbitrageContract, owner } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      expect(await arbitrageContract.paused()).to.be.false;
      
      await arbitrageContract.connect(owner).pause();
      expect(await arbitrageContract.paused()).to.be.true;
      
      await arbitrageContract.connect(owner).unpause();
      expect(await arbitrageContract.paused()).to.be.false;
    });

    it("Should not allow non-owner to pause", async function () {
      const { arbitrageContract, user } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      await expect(
        arbitrageContract.connect(user).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to emergency withdraw", async function () {
      const { arbitrageContract, owner } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      // Send some ETH to the contract
      await owner.sendTransaction({
        to: await arbitrageContract.getAddress(),
        value: ethers.parseEther("1.0")
      });
      
      const initialBalance = await ethers.provider.getBalance(owner.address);
      
      await arbitrageContract.connect(owner).emergencyWithdraw(ethers.ZeroAddress);
      
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });
  });

  describe("Statistics", function () {
    it("Should return correct initial statistics", async function () {
      const { arbitrageContract } = await loadFixture(deployArbitrageFlashLoanFixture);
      
      const [totalArbitrages, totalProfit, contractBalance] = await arbitrageContract.getStatistics();
      
      expect(totalArbitrages).to.equal(0);
      expect(totalProfit).to.equal(0);
      expect(contractBalance).to.equal(0);
    });
  });

  describe("Gas Optimization", function () {
    it("Should have reasonable gas costs for deployment", async function () {
      const ArbitrageFlashLoan = await ethers.getContractFactory("ArbitrageFlashLoan");
      const deployTx = ArbitrageFlashLoan.getDeployTransaction("0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb");
      
      const estimatedGas = await ethers.provider.estimateGas(deployTx);
      
      // Should be less than 3M gas
      expect(estimatedGas).to.be.lt(3000000);
    });
  });
});