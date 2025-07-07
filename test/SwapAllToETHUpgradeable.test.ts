import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { 
  SwapAllToETHUpgradeable, 
  MockUniswapV2Router, 
  MockWETH, 
  MockToken 
} from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

interface TestFixture {
  swapAllToETHUpgradeable: SwapAllToETHUpgradeable;
  mockRouter: MockUniswapV2Router;
  mockWETH: MockWETH;
  mockToken: MockToken;
  owner: SignerWithAddress;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
}

describe("SwapAllToETHUpgradeable", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployContractFixture(): Promise<TestFixture> {
    // Get the signers
    const [owner, user1, user2] = await ethers.getSigners();
    
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
      [
        await mockRouter.getAddress(),
        await mockWETH.getAddress(),
        owner.address
      ],
      { kind: 'uups' }
    ) as SwapAllToETHUpgradeable;
    
    await swapAllToETHUpgradeable.waitForDeployment();
    
    return { 
      swapAllToETHUpgradeable, 
      mockRouter, 
      mockWETH, 
      mockToken, 
      owner, 
      user1, 
      user2 
    };
  }

  describe("Deployment and Initialization", function () {
    it("Should deploy and initialize correctly", async function () {
      const { swapAllToETHUpgradeable, mockRouter, mockWETH, owner } = await loadFixture(deployContractFixture);
      
      expect(await swapAllToETHUpgradeable.uniswapRouter()).to.equal(await mockRouter.getAddress());
      expect(await swapAllToETHUpgradeable.WETH()).to.equal(await mockWETH.getAddress());
      expect(await swapAllToETHUpgradeable.owner()).to.equal(owner.address);
    });

    it("Should not allow re-initialization", async function () {
      const { swapAllToETHUpgradeable, mockRouter, mockWETH, user1 } = await loadFixture(deployContractFixture);
      
      await expect(
        swapAllToETHUpgradeable.connect(user1).initialize(
          await mockRouter.getAddress(),
          await mockWETH.getAddress(),
          user1.address
        )
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "Initializable__AlreadyInitialized");
    });
  });

  describe("Upgrade Functionality", function () {
    it("Should allow owner to upgrade the contract", async function () {
      const { swapAllToETHUpgradeable, owner } = await loadFixture(deployContractFixture);
      
      // Deploy a new implementation
      const SwapAllToETHUpgradeableV2 = await ethers.getContractFactory("SwapAllToETHUpgradeable");
      const newImplementation = await SwapAllToETHUpgradeableV2.deploy();
      
      // Upgrade the contract
      await swapAllToETHUpgradeable.connect(owner).upgradeTo(await newImplementation.getAddress());
      
      // Verify the upgrade was successful
      expect(await upgrades.erc1967.getImplementation(await swapAllToETHUpgradeable.getAddress()))
        .to.equal(await newImplementation.getAddress());
    });

    it("Should not allow non-owner to upgrade", async function () {
      const { swapAllToETHUpgradeable, user1 } = await loadFixture(deployContractFixture);
      
      // Deploy a new implementation
      const SwapAllToETHUpgradeableV2 = await ethers.getContractFactory("SwapAllToETHUpgradeable");
      const newImplementation = await SwapAllToETHUpgradeableV2.deploy();
      
      // Try to upgrade as non-owner
      await expect(
        swapAllToETHUpgradeable.connect(user1).upgradeTo(await newImplementation.getAddress())
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "OwnableUnauthorizedAccount");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update router", async function () {
      const { swapAllToETHUpgradeable, mockRouter, owner, user1 } = await loadFixture(deployContractFixture);
      
      const newRouter = await ethers.getContractFactory("MockUniswapV2Router");
      const newMockRouter = await newRouter.deploy();
      
      await swapAllToETHUpgradeable.connect(owner).updateRouter(await newMockRouter.getAddress());
      
      expect(await swapAllToETHUpgradeable.uniswapRouter()).to.equal(await newMockRouter.getAddress());
    });

    it("Should not allow non-owner to update router", async function () {
      const { swapAllToETHUpgradeable, user1 } = await loadFixture(deployContractFixture);
      
      await expect(
        swapAllToETHUpgradeable.connect(user1).updateRouter(user1.address)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to update WETH", async function () {
      const { swapAllToETHUpgradeable, mockWETH, owner, user1 } = await loadFixture(deployContractFixture);
      
      const newWETH = await ethers.getContractFactory("MockWETH");
      const newMockWETH = await newWETH.deploy();
      
      await swapAllToETHUpgradeable.connect(owner).updateWETH(await newMockWETH.getAddress());
      
      expect(await swapAllToETHUpgradeable.WETH()).to.equal(await newMockWETH.getAddress());
    });

    it("Should not allow non-owner to update WETH", async function () {
      const { swapAllToETHUpgradeable, user1 } = await loadFixture(deployContractFixture);
      
      await expect(
        swapAllToETHUpgradeable.connect(user1).updateWETH(user1.address)
      ).to.be.revertedWithCustomError(swapAllToETHUpgradeable, "OwnableUnauthorizedAccount");
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
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      
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
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      
      // The user should have received the ETH (minus gas costs)
      expect(finalETHBalance + gasCost - initialETHBalance).to.be.closeTo(
        ethReturn,
        ethers.parseEther("0.01") // Allow for small rounding errors
      );
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

    it("Should allow owner to recover both ETH and ERC20 tokens together", async function () {
      const { swapAllToETHUpgradeable, mockToken, owner, user2 } = await loadFixture(deployContractFixture);
      
      // Send tokens to contract
      const tokenAmount = ethers.parseUnits("100", 18);
      await mockToken.mint(await swapAllToETHUpgradeable.getAddress(), tokenAmount);
      
      // Send ETH to contract
      const ethAmount = ethers.parseEther("0.5");
      await owner.sendTransaction({
        to: await swapAllToETHUpgradeable.getAddress(),
        value: ethAmount
      });
      
      // Initial balances
      const initialTokenBalance = await mockToken.balanceOf(user2.address);
      const initialETHBalance = await ethers.provider.getBalance(user2.address);
      
      // Recover both ETH and tokens
      await swapAllToETHUpgradeable.connect(owner).recoverBoth(
        [await mockToken.getAddress()],
        [tokenAmount],
        ethAmount,
        user2.address
      );
      
      // Check user2 received both tokens and ETH
      expect(await mockToken.balanceOf(user2.address)).to.equal(initialTokenBalance + tokenAmount);
      const finalETHBalance = await ethers.provider.getBalance(user2.address);
      expect(finalETHBalance - initialETHBalance).to.equal(ethAmount);
    });
  });

  describe("Error Handling", function () {
    it("Should revert with invalid router address", async function () {
      const [owner] = await ethers.getSigners();
      
      const SwapAllToETHUpgradeable = await ethers.getContractFactory("SwapAllToETHUpgradeable");
      
      await expect(
        upgrades.deployProxy(
          SwapAllToETHUpgradeable,
          [
            ethers.ZeroAddress, // Invalid router
            await ethers.getContractFactory("MockWETH").then(f => f.deploy()).then(c => c.getAddress()),
            owner.address
          ],
          { kind: 'uups' }
        )
      ).to.be.revertedWithCustomError(SwapAllToETHUpgradeable, "InvalidRouter");
    });

    it("Should revert with invalid WETH address", async function () {
      const [owner] = await ethers.getSigners();
      
      const SwapAllToETHUpgradeable = await ethers.getContractFactory("SwapAllToETHUpgradeable");
      
      await expect(
        upgrades.deployProxy(
          SwapAllToETHUpgradeable,
          [
            await ethers.getContractFactory("MockUniswapV2Router").then(f => f.deploy()).then(c => c.getAddress()),
            ethers.ZeroAddress, // Invalid WETH
            owner.address
          ],
          { kind: 'uups' }
        )
      ).to.be.revertedWithCustomError(SwapAllToETHUpgradeable, "InvalidWETH");
    });
  });
}); 