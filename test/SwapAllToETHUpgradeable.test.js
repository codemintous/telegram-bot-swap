const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SwapAllToETHUpgradeable", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployContractFixture() {
    // Get the signers
    const [owner, user1, user2, newOwner] = await ethers.getSigners();
    
    // Create mock router and WETH contracts
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
    const mockRouter = await MockRouter.deploy();
    
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const mockWETH = await MockWETH.deploy();
    
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy("Mock Token", "MTK");
    
    // Deploy the upgradeable SwapAllToETH contract
    const SwapAllToETHUpgradeable = await ethers.getContractFactory("SwapAllToETHUpgradeable");
    const swapAllToETHUpgradeable = await upgrades.deployProxy(
      SwapAllToETHUpgradeable,
      [await mockRouter.getAddress(), await mockWETH.getAddress(), owner.address],
      {
        initializer: 'initialize',
        kind: 'uups'
      }
    );
    
    return { 
      swapAllToETHUpgradeable, 
      mockRouter, 
      mockWETH, 
      mockToken, 
      owner, 
      user1, 
      user2,
      newOwner,
      SwapAllToETHUpgradeable
    };
  }

  describe("Deployment", function () {
    it("Should set the right router and WETH addresses", async function () {
      const { swapAllToETHUpgradeable, mockRouter, mockWETH } = await loadFixture(deployContractFixture);
      
      expect(await swapAllToETHUpgradeable.uniswapRouter()).to.equal(await mockRouter.getAddress());
      expect(await swapAllToETHUpgradeable.WETH()).to.equal(await mockWETH.getAddress());
    });
    
    it("Should set the right owner", async function () {
      const { swapAllToETHUpgradeable, owner } = await loadFixture(deployContractFixture);
      
      expect(await swapAllToETHUpgradeable.owner()).to.equal(owner.address);
    });

    it("Should not allow re-initialization", async function () {
      const { swapAllToETHUpgradeable, mockRouter, mockWETH, user1 } = await loadFixture(deployContractFixture);
      
      await expect(
        swapAllToETHUpgradeable.initialize(await mockRouter.getAddress(), await mockWETH.getAddress(), user1.address)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "Initializable__AlreadyInitialized");
    });
  });

  describe("WETH Handling", function () {
    it("Should unwrap WETH to ETH", async function () {
      const { swapAllToETHUpgradeable, mockWETH, user1 } = await loadFixture(deployContractFixture);
      
      // Setup: User1 gets some WETH
      const wethAmount = ethers.parseEther("1.0");
      await mockWETH.deposit({ value: wethAmount });
      await mockWETH.transfer(user1.address, wethAmount);
      await mockWETH.connect(user1).approve(await swapAllToETHUpgradeable.getAddress(), wethAmount);
      
      // Initial balances
      const initialETHBalance = await ethers.provider.getBalance(user1.address);
      
      // Execute swap
      const tx = await swapAllToETHUpgradeable.connect(user1).swapAllTokensToETH(
        [await mockWETH.getAddress()],
        100 // 1% slippage
      );
      
      // Check results
      const finalETHBalance = await ethers.provider.getBalance(user1.address);
      
      // Account for gas costs in the calculation
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      
      // The user should have received the ETH (minus gas costs)
      expect(finalETHBalance + gasCost - initialETHBalance).to.be.closeTo(
        wethAmount,
        ethers.parseEther("0.01") // Allow for small rounding errors
      );
    });
  });

  describe("Token Swaps", function () {
    it("Should swap tokens to ETH", async function () {
      const { swapAllToETHUpgradeable, mockRouter, mockToken, mockWETH, user1 } = await loadFixture(deployContractFixture);
      
      // Setup: User1 gets some tokens
      const tokenAmount = ethers.parseUnits("1000", 18);
      await mockToken.mint(user1.address, tokenAmount);
      await mockToken.connect(user1).approve(await swapAllToETHUpgradeable.getAddress(), tokenAmount);
      
      // Setup mock router to return ETH
      const ethReturn = ethers.parseEther("0.5"); // 1000 tokens = 0.5 ETH
      await mockRouter.setAmountOut(ethReturn);
      await mockRouter.setMockETHAmount(ethReturn);
      
      // Initial balances
      const initialETHBalance = await ethers.provider.getBalance(user1.address);
      
      // Execute swap
      const tx = await swapAllToETHUpgradeable.connect(user1).swapAllTokensToETH(
        [await mockToken.getAddress()],
        100 // 1% slippage
      );
      
      // Check results
      const finalETHBalance = await ethers.provider.getBalance(user1.address);
      
      // Account for gas costs in the calculation
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      
      // The user should have received the ETH (minus gas costs)
      expect(finalETHBalance + gasCost - initialETHBalance).to.be.closeTo(
        ethReturn,
        ethers.parseEther("0.01") // Allow for small rounding errors
      );
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update router", async function () {
      const { swapAllToETHUpgradeable, mockRouter, owner, user1 } = await loadFixture(deployContractFixture);
      
      const newRouter = await ethers.getContractFactory("MockUniswapV2Router");
      const newMockRouter = await newRouter.deploy();
      
      const oldRouter = await swapAllToETHUpgradeable.uniswapRouter();
      
      await expect(swapAllToETHUpgradeable.connect(owner).updateRouter(await newMockRouter.getAddress()))
        .to.emit(swapAllToETHUpgradeable, "RouterUpdated")
        .withArgs(oldRouter, await newMockRouter.getAddress());
      
      expect(await swapAllToETHUpgradeable.uniswapRouter()).to.equal(await newMockRouter.getAddress());
    });

    it("Should allow owner to update WETH", async function () {
      const { swapAllToETHUpgradeable, mockWETH, owner } = await loadFixture(deployContractFixture);
      
      const newWETH = await ethers.getContractFactory("MockWETH");
      const newMockWETH = await newWETH.deploy();
      
      const oldWETH = await swapAllToETHUpgradeable.WETH();
      
      await expect(swapAllToETHUpgradeable.connect(owner).updateWETH(await newMockWETH.getAddress()))
        .to.emit(swapAllToETHUpgradeable, "WETHUpdated")
        .withArgs(oldWETH, await newMockWETH.getAddress());
      
      expect(await swapAllToETHUpgradeable.WETH()).to.equal(await newMockWETH.getAddress());
    });

    it("Should not allow non-owner to update router", async function () {
      const { swapAllToETHUpgradeable, user1 } = await loadFixture(deployContractFixture);
      
      await expect(
        swapAllToETHUpgradeable.connect(user1).updateRouter(user1.address)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "OwnableUnauthorizedAccount");
    });

    it("Should not allow non-owner to update WETH", async function () {
      const { swapAllToETHUpgradeable, user1 } = await loadFixture(deployContractFixture);
      
      await expect(
        swapAllToETHUpgradeable.connect(user1).updateWETH(user1.address)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "OwnableUnauthorizedAccount");
    });
  });

  describe("Recovery Functions", function () {
    it("Should allow owner to recover ERC20 tokens", async function () {
      const { swapAllToETHUpgradeable, mockToken, owner, user2 } = await loadFixture(deployContractFixture);
      
      // Send tokens to contract
      const tokenAmount = ethers.parseUnits("100", 18);
      await mockToken.mint(await swapAllToETHUpgradeable.getAddress(), tokenAmount);
      
      // Recover tokens
      await swapAllToETHUpgradeable.connect(owner).recoverERC20(
        await mockToken.getAddress(),
        tokenAmount,
        user2.address
      );
      
      // Check user2 received the tokens
      expect(await mockToken.balanceOf(user2.address)).to.equal(tokenAmount);
    });
    
    it("Should allow owner to recover ETH", async function () {
      const { swapAllToETHUpgradeable, owner, user2 } = await loadFixture(deployContractFixture);
      
      // Send ETH to contract
      const ethAmount = ethers.parseEther("1.0");
      await owner.sendTransaction({
        to: await swapAllToETHUpgradeable.getAddress(),
        value: ethAmount
      });
      
      // Initial balance
      const initialBalance = await ethers.provider.getBalance(user2.address);
      
      // Recover ETH
      await swapAllToETHUpgradeable.connect(owner).recoverETH(
        ethAmount,
        user2.address
      );
      
      // Check user2 received the ETH
      const finalBalance = await ethers.provider.getBalance(user2.address);
      expect(finalBalance - initialBalance).to.equal(ethAmount);
    });
  });

  describe("Upgrade Functionality", function () {
    it("Should allow owner to upgrade the contract", async function () {
      const { swapAllToETHUpgradeable, SwapAllToETHUpgradeable, owner } = await loadFixture(deployContractFixture);
      
      const proxyAddress = await swapAllToETHUpgradeable.getAddress();
      const oldImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
      
      // Deploy new implementation
      const newImplementation = await upgrades.upgradeProxy(proxyAddress, SwapAllToETHUpgradeable);
      await newImplementation.waitForDeployment();
      
      const newImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
      
      // Check that implementation changed
      expect(newImplAddress).to.not.equal(oldImplementation);
      
      // Check that contract still works
      const contract = await ethers.getContractAt("SwapAllToETHUpgradeable", proxyAddress);
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should not allow non-owner to upgrade the contract", async function () {
      const { swapAllToETHUpgradeable, SwapAllToETHUpgradeable, user1 } = await loadFixture(deployContractFixture);
      
      const proxyAddress = await swapAllToETHUpgradeable.getAddress();
      
      // Try to upgrade with non-owner (this should fail)
      await expect(
        upgrades.upgradeProxy(proxyAddress, SwapAllToETHUpgradeable.connect(user1))
      ).to.be.reverted;
    });

    it("Should preserve state after upgrade", async function () {
      const { swapAllToETHUpgradeable, SwapAllToETHUpgradeable, mockRouter, mockWETH, owner } = await loadFixture(deployContractFixture);
      
      const proxyAddress = await swapAllToETHUpgradeable.getAddress();
      
      // Check initial state
      expect(await swapAllToETHUpgradeable.uniswapRouter()).to.equal(await mockRouter.getAddress());
      expect(await swapAllToETHUpgradeable.WETH()).to.equal(await mockWETH.getAddress());
      expect(await swapAllToETHUpgradeable.owner()).to.equal(owner.address);
      
      // Upgrade
      const upgraded = await upgrades.upgradeProxy(proxyAddress, SwapAllToETHUpgradeable);
      await upgraded.waitForDeployment();
      
      // Check state is preserved
      const contract = await ethers.getContractAt("SwapAllToETHUpgradeable", proxyAddress);
      expect(await contract.uniswapRouter()).to.equal(await mockRouter.getAddress());
      expect(await contract.WETH()).to.equal(await mockWETH.getAddress());
      expect(await contract.owner()).to.equal(owner.address);
    });
  });

  describe("Error Handling", function () {
    it("Should revert with custom errors for invalid inputs", async function () {
      const { swapAllToETHUpgradeable, owner } = await loadFixture(deployContractFixture);
      
      // Test empty tokens array
      await expect(
        swapAllToETHUpgradeable.swapAllTokensToETH([], 100)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "NoTokensProvided");
      
      // Test high slippage
      await expect(
        swapAllToETHUpgradeable.swapAllTokensToETH([ethers.ZeroAddress], 10001)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "SlippageTooHigh");
      
      // Test invalid router update
      await expect(
        swapAllToETHUpgradeable.connect(owner).updateRouter(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "InvalidRouter");
      
      // Test invalid WETH update
      await expect(
        swapAllToETHUpgradeable.connect(owner).updateWETH(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "InvalidWETH");
    });
  });
}); 