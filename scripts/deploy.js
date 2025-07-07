// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
const { ethers } = require("hardhat");

// Mainnet addresses
const ROUTER_ADDRESS = {
  // Uniswap V2 Router
  mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  goerli: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Same as mainnet
  sepolia: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Same as mainnet
  hardhat: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Same as mainnet
};

const WETH_ADDRESS = {
  mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  goerli: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  sepolia: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
  hardhat: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Same as mainnet
};

async function main() {
  // Get the network name
  const network = hre.network.name;
  console.log(`Deploying to ${network} network...`);
  
  // Get the contract factory
  const SwapAllToETH = await ethers.getContractFactory("SwapAllToETH");
  
  // Get the router and WETH addresses for the current network
  const routerAddress = ROUTER_ADDRESS[network];
  const wethAddress = WETH_ADDRESS[network];
  
  console.log(`Using Router address: ${routerAddress}`);
  console.log(`Using WETH address: ${wethAddress}`);
  
  // Deploy the contract
  const swapAllToETH = await SwapAllToETH.deploy(routerAddress, wethAddress);
  await swapAllToETH.waitForDeployment();
  
  const deployedAddress = await swapAllToETH.getAddress();
  console.log(`SwapAllToETH deployed to: ${deployedAddress}`);
  
  // Wait for a few confirmations for Etherscan verification
  console.log("Waiting for confirmations...");
  await swapAllToETH.deploymentTransaction().wait(5);
  
  // Verify the contract on Etherscan if not on local network
  if (network !== "hardhat" && network !== "localhost") {
    console.log("Verifying contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: deployedAddress,
        constructorArguments: [routerAddress, wethAddress],
      });
      console.log("Contract verified on Etherscan!");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
  
  return deployedAddress;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 