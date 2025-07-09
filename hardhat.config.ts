import "@nomicfoundation/hardhat-verify";
import "hardhat-gas-reporter";
import "@nomicfoundation/hardhat-ethers";
import "@typechain/hardhat";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import "solidity-coverage";
import "hardhat-tracer";
import "@nomicfoundation/hardhat-chai-matchers";
import "hardhat-abi-exporter";
require("dotenv").config();

import { HardhatUserConfig } from "hardhat/config";

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey = process.env.INFURA_API_KEY;
// Add your private key here (without 0x prefix)
const privateKey = "your_private_key_here_without_0x_prefix";

if (!infuraApiKey) {
  throw new Error("Please set your INFURA_API_KEY in a .env file");
}

const chainIds = {
  ganache: 5777,
  goerli: 5,
  hardhat: 7545,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  bscTestnet: 97,
  bscMainnet: 56,
  MaticTestnet: 80001,
  MaticMainnet: 137,
  ropsten: 3,
  ArbitrumOne: 42161,
  BaseMainnet: 8453,
};

const config: HardhatUserConfig = {
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 21,
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic,
      },
      forking: {
        // eslint-disable-next-line
        enabled: true,
        url:"https://mainnet.infura.io/v3/5886b76859c049da9aefde0d708cb3e0",
      },
      chainId: 1,
      gas: 12000000
    },
    ganache: {
      chainId: 5777,
      url: "http://127.0.0.1:7545/",
    },
    // mainnet: {
    //   accounts: [
    //     "your_private_key_here_without_0x_prefix", // Replace with your actual private key

    //   ],
    //   chainId: chainIds["mainnet"],
    //   url: "https://mainnet.infura.io/v3/5886b76859c049da9aefde0d708cb3e0",
    // }
    // rinkeby: {
    //   accounts: {
    //     mnemonic,
    //   },
    //   chainId: chainIds["rinkeby"],
    //   url: "https://rinkeby.infura.io/v3/" + infuraApiKey + "",
    // }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  mocha: {
    timeout: 400000,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY
        ? process.env.ETHERSCAN_API_KEY
        : "",
      bsc: process.env.BSCSCAN_API_KEY ? process.env.BSCSCAN_API_KEY : "",
    },
  },
  abiExporter: {
    path: "./abi",
    clear: true,
    flat: true,
    only: [],
    spacing: 2,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
};

export default config; 