import { ethers, run } from "hardhat";

// Mainnet addresses
const ROUTER_ADDRESS: { [key: string]: string } = {
  // Uniswap V2 Router
  mainnet: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  goerli: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Same as mainnet
  sepolia: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Same as mainnet
  hardhat: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Same as mainnet
};

const WETH_ADDRESS: { [key: string]: string } = {
  mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  goerli: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  sepolia: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
  hardhat: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Same as mainnet
};

interface DeploymentInfo {
  network: string;
  contractAddress: string;
  routerAddress: string;
  wethAddress: string;
  deployer: string;
  timestamp: string;
}

async function main(): Promise<DeploymentInfo> {
  // Get the network name
  const network = (await ethers.provider.getNetwork()).name;
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
  const deploymentTx = swapAllToETH.deploymentTransaction();
  if (deploymentTx) {
    await deploymentTx.wait(5);
  }
  
  // Verify the contract on Etherscan if not on local network
  if (network !== "hardhat" && network !== "localhost") {
    console.log("Verifying contract on Etherscan...");
    try {
      await run("verify:verify", {
        address: deployedAddress,
        constructorArguments: [routerAddress, wethAddress],
      });
      console.log("Contract verified on Etherscan!");
    } catch (error) {
      console.error("Error verifying contract:", error);
    }
  }
  
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  
  if (!deployer) {
    throw new Error("No deployer account found");
  }
  
  const deploymentInfo: DeploymentInfo = {
    network: network || "unknown",
    contractAddress: deployedAddress,
    routerAddress: routerAddress || "",
    wethAddress: wethAddress || "",
    deployer: deployer.address,
    timestamp: new Date().toISOString()
  };
  
  return deploymentInfo;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((deploymentInfo) => {
    console.log("\nDeployment Summary:");
    console.log("===================");
    console.log(`Network: ${deploymentInfo.network}`);
    console.log(`Contract Address: ${deploymentInfo.contractAddress}`);
    console.log(`Router Address: ${deploymentInfo.routerAddress}`);
    console.log(`WETH Address: ${deploymentInfo.wethAddress}`);
    console.log(`Deployer: ${deploymentInfo.deployer}`);
    console.log(`Timestamp: ${deploymentInfo.timestamp}`);
    
    console.log("\n=== Recovery Function Examples ===");
    console.log("// Recover both ETH and ERC20 tokens in one transaction:");
    console.log("// await swapAllToETH.recoverBoth(");
    console.log("//   [token1Address, token2Address], // Array of token addresses");
    console.log("//   [amount1, amount2],             // Array of amounts to recover");
    console.log("//   ethers.parseEther('1.0'),       // ETH amount to recover");
    console.log("//   recipientAddress                 // Address to send to");
    console.log("// );");
    
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 