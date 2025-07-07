const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("SwapAllToETH", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployContractFixture() {
    // Get the signers
    const [owner, user1, user2] = await ethers.getSigners();
    
    // Create mock router and WETH contracts
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
    const mockRouter = await MockRouter.deploy();
    
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const mockWETH = await MockWETH.deploy();
    
    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy("Mock Token", "MTK");
    
    // Deploy the SwapAllToETH contract
    const SwapAllToETH = await ethers.getContractFactory("SwapAllToETH");
    const swapAllToETH = await SwapAllToETH.deploy(
      await mockRouter.getAddress(),
      await mockWETH.getAddress()
    );
    
    return { 
      swapAllToETH, 
      mockRouter, 
      mockWETH, 
      mockToken, 
      owner, 
      user1, 
      user2 
    };
  }

  describe("Deployment", function () {
    it("Should set the right router and WETH addresses", async function () {
      const { swapAllToETH, mockRouter, mockWETH } = await loadFixture(deployContractFixture);
      
      expect(await swapAllToETH.uniswapRouter()).to.equal(await mockRouter.getAddress());
      expect(await swapAllToETH.WETH()).to.equal(await mockWETH.getAddress());
    });
    
    it("Should set the right owner", async function () {
      const { swapAllToETH, owner } = await loadFixture(deployContractFixture);
      
      expect(await swapAllToETH.owner()).to.equal(owner.address);
    });
  });

  describe("WETH Handling", function () {
    it("Should unwrap WETH to ETH", async function () {
      const { swapAllToETH, mockWETH, user1 } = await loadFixture(deployContractFixture);
      
      // Setup: User1 gets some WETH
      const wethAmount = ethers.parseEther("1.0");
      await mockWETH.deposit({ value: wethAmount });
      await mockWETH.transfer(user1.address, wethAmount);
      await mockWETH.connect(user1).approve(await swapAllToETH.getAddress(), wethAmount);
      
      // Initial balances
      const initialETHBalance = await ethers.provider.getBalance(user1.address);
      
      // Execute swap
      const tx = await swapAllToETH.connect(user1).swapAllTokensToETH(
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
      const { swapAllToETH, mockRouter, mockToken, mockWETH, user1 } = await loadFixture(deployContractFixture);
      
      // Setup: User1 gets some tokens
      const tokenAmount = ethers.parseUnits("1000", 18);
      await mockToken.mint(user1.address, tokenAmount);
      await mockToken.connect(user1).approve(await swapAllToETH.getAddress(), tokenAmount);
      
      // Setup mock router to return ETH
      const ethReturn = ethers.parseEther("0.5"); // 1000 tokens = 0.5 ETH
      await mockRouter.setAmountOut(ethReturn);
      await mockRouter.setMockETHAmount(ethReturn);
      
      // Initial balances
      const initialETHBalance = await ethers.provider.getBalance(user1.address);
      
      // Execute swap
      const tx = await swapAllToETH.connect(user1).swapAllTokensToETH(
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

  describe("Recovery Functions", function () {
    it("Should allow owner to recover ERC20 tokens", async function () {
      const { swapAllToETH, mockToken, owner, user2 } = await loadFixture(deployContractFixture);
      
      // Send tokens to contract
      const tokenAmount = ethers.parseUnits("100", 18);
      await mockToken.mint(await swapAllToETH.getAddress(), tokenAmount);
      
      // Recover tokens
      await swapAllToETH.connect(owner).recoverERC20(
        await mockToken.getAddress(),
        tokenAmount,
        user2.address
      );
      
      // Check user2 received the tokens
      expect(await mockToken.balanceOf(user2.address)).to.equal(tokenAmount);
    });
    
    it("Should allow owner to recover ETH", async function () {
      const { swapAllToETH, owner, user2 } = await loadFixture(deployContractFixture);
      
      // Send ETH to contract
      const ethAmount = ethers.parseEther("1.0");
      await owner.sendTransaction({
        to: await swapAllToETH.getAddress(),
        value: ethAmount
      });
      
      // Initial balance
      const initialBalance = await ethers.provider.getBalance(user2.address);
      
      // Recover ETH
      await swapAllToETH.connect(owner).recoverETH(
        ethAmount,
        user2.address
      );
      
      // Check user2 received the ETH
      const finalBalance = await ethers.provider.getBalance(user2.address);
      expect(finalBalance - initialBalance).to.equal(ethAmount);
    });
  });
}); 