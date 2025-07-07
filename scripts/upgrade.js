// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
const { ethers, upgrades } = require("hardhat");

async function main() {
  // Get the network name
  const network = hre.network.name;
  console.log(`Upgrading on ${network} network...`);
  
  // Get the signers
  const [deployer] = await ethers.getSigners();
  console.log(`Upgrading with account: ${deployer.address}`);
  
  // Get the proxy address from command line arguments or use a default
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) {
    console.error("Please set PROXY_ADDRESS environment variable");
    process.exit(1);
  }
  
  console.log(`Proxy address: ${proxyAddress}`);
  
  // Get the current implementation address
  const currentImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`Current implementation: ${currentImplementation}`);
  
  // Get the contract factory for the new implementation
  const SwapAllToETHUpgradeable = await ethers.getContractFactory("SwapAllToETHUpgradeable");
  
  // Upgrade the contract
  console.log("Upgrading SwapAllToETHUpgradeable...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, SwapAllToETHUpgradeable);
  
  await upgraded.waitForDeployment();
  
  // Get the new implementation address
  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`New implementation: ${newImplementation}`);
  
  // Wait for a few confirmations for Etherscan verification
  console.log("Waiting for confirmations...");
  await upgraded.deploymentTransaction().wait(5);
  
  // Verify the new implementation contract on Etherscan if not on local network
  if (network !== "hardhat" && network !== "localhost") {
    console.log("Verifying new implementation contract on Etherscan...");
    try {
      await hre.run("verify:verify", {
        address: newImplementation,
        constructorArguments: [],
      });
      console.log("New implementation contract verified on Etherscan!");
    } catch (error) {
      console.error("Error verifying new implementation contract:", error);
    }
  }
  
  // Test that the upgrade was successful
  console.log("Testing upgrade...");
  try {
    const contract = await ethers.getContractAt("SwapAllToETHUpgradeable", proxyAddress);
    const owner = await contract.owner();
    console.log(`Contract owner: ${owner}`);
    console.log("Upgrade test successful!");
  } catch (error) {
    console.error("Upgrade test failed:", error);
  }
  
  console.log("\nUpgrade Summary:");
  console.log("================");
  console.log(`Network: ${network}`);
  console.log(`Proxy Address: ${proxyAddress}`);
  console.log(`Old Implementation: ${currentImplementation}`);
  console.log(`New Implementation: ${newImplementation}`);
  console.log(`Upgrader: ${deployer.address}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  return {
    network: network,
    proxyAddress: proxyAddress,
    oldImplementation: currentImplementation,
    newImplementation: newImplementation,
    upgrader: deployer.address,
    timestamp: new Date().toISOString()
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 