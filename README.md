# Telegram Bot Swap Contract

A smart contract for swapping multiple ERC20 tokens to ETH using Uniswap V2. This contract allows users to batch swap all their tokens to ETH in a single transaction, with proper error handling and recovery mechanisms.

## Features

- **Batch Token Swapping**: Swap multiple tokens to ETH in a single transaction
- **WETH Support**: Special handling for WETH unwrapping
- **Slippage Protection**: Configurable slippage tolerance
- **Error Recovery**: Graceful handling of failed swaps with token refunds
- **Owner Recovery**: Admin functions to recover stuck tokens and ETH
- **Gas Optimization**: Optimized for efficient gas usage
- **Reentrancy Protection**: Secure against reentrancy attacks

## Contract Overview

### `SwapAllToETH` (Non-Upgradeable)

The main contract that handles token swapping functionality.

### `SwapAllToETHUpgradeable` (Upgradeable)

An upgradeable version of the contract using OpenZeppelin's UUPS proxy pattern. This version allows for:
- Contract upgrades without losing state
- Admin functions to update router and WETH addresses
- Enhanced security with upgrade controls

#### Key Functions

- `swapAllTokensToETH(address[] tokens, uint256 slippageBps)`: Main function to swap tokens to ETH
- `recoverERC20(address token, uint256 amount, address to)`: Owner function to recover stuck ERC20 tokens
- `recoverETH(uint256 amount, address to)`: Owner function to recover stuck ETH

#### Events

- `TokenSwapped`: Emitted when a token is successfully swapped
- `TokenSwapFailed`: Emitted when a token swap fails
- `RecoveredERC20`: Emitted when ERC20 tokens are recovered
- `RecoveredETH`: Emitted when ETH is recovered

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd telegrambotSwapcontract
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```env
PRIVATE_KEY=your_private_key_here
INFURA_API_KEY=your_infura_api_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
REPORT_GAS=true
```

## Usage

### Compilation

```bash
npm run compile
```

### Testing

```bash
npm test
```

### Deployment

#### Local Network
```bash
npx hardhat run scripts/deploy.js --network localhost
```

#### Test Networks
```bash
# Goerli
npm run deploy:goerli

# Sepolia
npm run deploy:sepolia
```

#### Mainnet
```bash
npm run deploy:mainnet
```

### Upgradeable Contract Deployment

#### Local Network
```bash
npm run deploy:upgradeable
```

#### Test Networks
```bash
# Goerli
npm run deploy:upgradeable:goerli

# Sepolia
npm run deploy:upgradeable:sepolia
```

#### Mainnet
```bash
npm run deploy:upgradeable:mainnet
```

### Contract Upgrades

To upgrade the contract, set the `PROXY_ADDRESS` environment variable and run:

```bash
# Local
npm run upgrade

# Test Networks
npm run upgrade:goerli
npm run upgrade:sepolia

# Mainnet
npm run upgrade:mainnet
```

## Network Configuration

The contract is configured to work with the following networks:

- **Mainnet**: Uniswap V2 Router and WETH addresses
- **Goerli**: Testnet addresses
- **Sepolia**: Testnet addresses
- **Hardhat**: Local development network

### Addresses

| Network | Router Address | WETH Address |
|---------|----------------|--------------|
| Mainnet | 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D | 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 |
| Goerli | 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D | 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6 |
| Sepolia | 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D | 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9 |

## Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Ownable**: Access control for admin functions
- **SafeERC20**: Safe token transfer operations
- **Error Handling**: Comprehensive error handling with fallbacks
- **Slippage Protection**: Configurable slippage tolerance

## Testing

The project includes comprehensive tests covering:

- Contract deployment
- WETH unwrapping functionality
- Token swapping functionality
- Recovery functions
- Error handling scenarios

Run tests with:
```bash
npm test
```

## Gas Optimization

The contract is optimized for gas efficiency:

- Uses `immutable` variables for router and WETH addresses
- Optimized Solidity compiler settings
- Efficient loop structures
- Minimal storage operations

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk. Always test thoroughly on testnets before deploying to mainnet. 