// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
const { ethers, upgrades } = require("hardhat");

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
  
  // Get the signers
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  
  // Get the router and WETH addresses for the current network
  const routerAddress = ROUTER_ADDRESS[network];
  const wethAddress = WETH_ADDRESS[network];
  
  console.log(`Using Router address: ${routerAddress}`);
  console.log(`Using WETH address: ${wethAddress}`);
  
  // Get the contract factory
  const SwapAllToETHUpgradeable = await ethers.getContractFactory("SwapAllToETHUpgradeable");
  
  // Deploy the upgradeable contract
  console.log("Deploying SwapAllToETHUpgradeable...");
  const swapAllToETHUpgradeable = await upgrades.deployProxy(
    SwapAllToETHUpgradeable,
    [routerAddress, wethAddress, deployer.address],
    {
      initializer: 'initialize',
      kind: 'uups'
    }
  );
  
  await swapAllToETHUpgradeable.waitForDeployment();
  
  const deployedAddress = await swapAllToETHUpgradeable.getAddress();
  console.log(`SwapAllToETHUpgradeable deployed to: ${deployedAddress}`);
  
  // Get the implementation address
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(deployedAddress);
  console.log(`Implementation address: ${implementationAddress}`);
  
  // Get the admin address
  const adminAddress = await upgrades.erc1967.getAdminAddress(deployedAddress);
  console.log(`Proxy admin address: ${adminAddress}`);
  
  // Wait for a few confirmations for Etherscan verification
  console.log("Waiting for confirmations...");
  await swapAllToETHUpgradeable.deploymentTransaction().wait(5);
  
  // Verify the implementation contract on Etherscan if not on local network
  if (network !== "hardhat" && network !== "localhost") {
    console.log("Verifying implementation contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: implementationAddress,
        constructorArguments: [],
      });
      console.log("Implementation contract verified on Etherscan!");
    } catch (error) {
      console.error("Error verifying implementation contract:", error);
    }
  }
  
  // Save deployment info
  const deploymentInfo = {
    network: network,
    proxyAddress: deployedAddress,
    implementationAddress: implementationAddress,
    adminAddress: adminAddress,
    routerAddress: routerAddress,
    wethAddress: wethAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };
  
  console.log("\nDeployment Summary:");
  console.log("===================");
  console.log(`Network: ${deploymentInfo.network}`);
  console.log(`Proxy Address: ${deploymentInfo.proxyAddress}`);
  console.log(`Implementation Address: ${deploymentInfo.implementationAddress}`);
  console.log(`Admin Address: ${deploymentInfo.adminAddress}`);
  console.log(`Router Address: ${deploymentInfo.routerAddress}`);
  console.log(`WETH Address: ${deploymentInfo.wethAddress}`);
  console.log(`Deployer: ${deploymentInfo.deployer}`);
  console.log(`Timestamp: ${deploymentInfo.timestamp}`);
  
  return deploymentInfo;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 