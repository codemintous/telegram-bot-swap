import { ethers, run } from "hardhat";
import { upgrades } from "hardhat";

interface UpgradeInfo {
  network: string;
  proxyAddress: string;
  oldImplementation: string;
  newImplementation: string;
  upgrader: string;
  timestamp: string;
}

async function main(): Promise<UpgradeInfo> {
  // Get the network name
  const network = (await ethers.provider.getNetwork()).name;
  console.log(`Upgrading on ${network} network...`);
  
  // Get the signers
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  if (!deployer) {
    throw new Error("No deployer account found");
  }
  
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
  const deploymentTx = upgraded.deploymentTransaction();
  if (deploymentTx) {
    await deploymentTx.wait(5);
  }
  
  // Verify the new implementation contract on Etherscan if not on local network
  if (network !== "hardhat" && network !== "localhost") {
    console.log("Verifying new implementation contract on Etherscan...");
    try {
      await run("verify:verify", {
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
  
  const upgradeInfo: UpgradeInfo = {
    network: network || "unknown",
    proxyAddress,
    oldImplementation: currentImplementation,
    newImplementation,
    upgrader: deployer.address,
    timestamp: new Date().toISOString()
  };
  
  return upgradeInfo;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((upgradeInfo) => {
    console.log("\nUpgrade Summary:");
    console.log("================");
    console.log(`Network: ${upgradeInfo.network}`);
    console.log(`Proxy Address: ${upgradeInfo.proxyAddress}`);
    console.log(`Old Implementation: ${upgradeInfo.oldImplementation}`);
    console.log(`New Implementation: ${upgradeInfo.newImplementation}`);
    console.log(`Upgrader: ${upgradeInfo.upgrader}`);
    console.log(`Timestamp: ${upgradeInfo.timestamp}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 