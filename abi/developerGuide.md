# DeepWhalesRouter Developer Documentation

## Overview

The DeepWhalesRouter is an advanced smart contract that enables users to execute token swaps on Uniswap V2 and V3 with integrated, configurable fee collection, a robust referral system, immediate fee distribution, comprehensive analytics, and emergency controls. This guide provides developers with all necessary details to interact with the DeepWhalesRouter contract, including function signatures, analytics, error handling, and integration examples.

## Key Features

- Execute swaps on Uniswap V2 and V3 (single and multi-hop)
- Built-in, configurable fee collection (ETH equivalent)
- Immediate fee distribution with referral rewards (configurable split)
- Full referral analytics: track referrer earnings, volume, and user relationships
- Special handling for tax/fee-on-transfer tokens
- Per-token slippage tolerance configuration
- Emergency circuit breaker and recovery controls
- Pausable functionality for enhanced security
- Extensive event emission for analytics and monitoring
- Comprehensive public view functions for reporting and analytics

## Contract Architecture

The DeepWhalesRouter integrates with:

- Uniswap V2 Router (`IUniswapV2Router02`)
- Uniswap V3 Router (`ISwapRouter`)
- Uniswap V3 Quoter (`IQuoter`)
- Wrapped ETH (`IWETH`)

### Core Constants

| Constant                 | Value | Description                                         |
| ------------------------ | ----- | --------------------------------------------------- |
| `FEE_DENOMINATOR`        | 10000 | Base for percentage calculations (100% = 10000 bps) |
| `MAX_FEE_BPS`            | 500   | Maximum fee: 5%                                     |
| `MAX_SLIPPAGE_TOLERANCE` | 1000  | Maximum slippage tolerance: 10%                     |
| `PROTOCOL_TYPE_V2`       | 1     | Enum value for Uniswap V2 swaps                     |
| `PROTOCOL_TYPE_V3`       | 2     | Enum value for Uniswap V3 swaps                     |
| `PROTOCOL_TYPE_V3_MULTI` | 3     | Enum value for Uniswap V3 multi-hop swaps           |

Note: Uniswap V3 fee tiers (500, 3000, 10000) are validated dynamically but not stored as constants.

### Access Control Roles

| Role                   | Constant                            | Description                                             |
| ---------------------- | ----------------------------------- | ------------------------------------------------------- |
| `DEFAULT_ADMIN_ROLE`   | 0x00                                | Can grant/revoke all roles and set fee beneficiary     |
| `FEE_MANAGER_ROLE`     | `keccak256("FEE_MANAGER_ROLE")`     | Can modify fee, referral, and slippage settings        |
| `EMERGENCY_ADMIN_ROLE` | `keccak256("EMERGENCY_ADMIN_ROLE")` | Can activate emergency state and recover funds          |
| `PAUSER_ROLE`          | `keccak256("PAUSER_ROLE")`          | Can pause and unpause the router                       |

### Storage Optimization

The contract uses a packed storage struct for gas efficiency:

```solidity
struct FeeConfig {
    uint16 defaultFeeBps;    // Default fee in basis points (0-500)
    uint16 slippageTolerance; // Default slippage tolerance for fee conversion (0-1000)
    bool feesEnabled;        // Global fee collection toggle
    bool emergencyState;     // Emergency state flag
}
```

This struct packs all fee-related configuration into a single storage slot to minimize gas costs for reads and writes.

### Function Modifiers

#### `swapAllowed`

All swap functions use the `swapAllowed` modifier which prevents execution when:
- The contract is paused (via OpenZeppelin's Pausable)
- The contract is in emergency state
- This provides multi-layered protection for user funds and contract operations

## Interacting with DeepWhalesRouter

### Swap Functions

All swap functions require a `referrer` parameter (use `address(0)` if no referrer) and return the actual output amount.

#### Uniswap V2

1.  **`swapExactTokensForTokensV2`**

    ```solidity
    function swapExactTokensForTokensV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        uint16 dynamicFeeBps, // Router fee for this specific swap, in BPS. Use 0 for default fee.
        address referrer
    ) external returns (uint256 amountOut);
    ```

    *   **Purpose**: Swaps an exact amount of input tokens (`tokenIn`) for a minimum amount of output tokens (`tokenOut`) using Uniswap V2 pools.
    *   **Parameters**:
        *   `tokenIn`: Address of the ERC20 token to swap from.
        *   `tokenOut`: Address of the ERC20 token to swap to.
        *   `amountIn`: The exact amount of `tokenIn` to send for the swap.
        *   `amountOutMin`: The minimum amount of `tokenOut` the caller is willing to receive (slippage protection). The transaction will revert if the output is less than this amount.
        *   `deadline`: A Unix timestamp after which the transaction will revert. Prevents execution of stale swaps.
        *   `dynamicFeeBps`: Optional fee override in basis points (0-500). If 0, the contract's default fee is used.
        *   `referrer`: Address of the referrer (use `address(0)` if none). Referrers receive a percentage of the collected fee.
    *   **Return Values**:
        *   `amountOut`: The actual amount of `tokenOut` received by the caller after the swap and fee deduction.
    *   **Side Effects**:
        *   Transfers `amountIn` of `tokenIn` from the caller (`msg.sender`) to the router contract.
        *   Calculates and collects a fee based on `amountIn` and the applicable fee percentage (`dynamicFeeBps` or default).
        *   Converts the collected fee (if any) from `tokenIn` to ETH.
        *   Distributes the converted ETH fee immediately to the fee beneficiary and the referrer (if applicable).
        *   Approves the Uniswap V2 Router to spend the `tokenIn` (amount after fee deduction).
        *   Executes the swap on Uniswap V2.
        *   Transfers the resulting `amountOut` of `tokenOut` directly to the caller (`msg.sender`).
        *   Updates referral analytics (volume, earnings, first seen).
        *   Emits `SwapExecuted`, `FeeCollection`, `FeeDistributed`, `UserReferred` (if applicable), and potentially `ReferralPaymentFailed` events.
    *   **Reverts**:
        *   `ZeroAddressNotAllowed`: If `tokenIn` or `tokenOut` is the zero address.
        *   `DeadlineExpired`: If `block.timestamp` is greater than `deadline`.
        *   `InsufficientAmount`: If `amountIn` is zero.
        *   `SelfReferralNotAllowed`: If `referrer` is the same as `msg.sender`.
        *   `InvalidReferrerAddress`: If `referrer` is the router contract address.
        *   `FeeTooHigh`: If `dynamicFeeBps` is greater than `MAX_FEE_BPS` (500).
        *   If the underlying Uniswap V2 swap reverts (e.g., `UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT`).
        *   If the ERC20 `transferFrom` fails.
        *   If the fee distribution ETH transfer fails.
        *   If the contract is in an emergency state (`Function restricted during emergency`).
    *   **Access Control**: None (callable by any address).

    **TypeScript Example (viem.sh)**

    ```typescript
    import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits, getContract } from "viem";
    import { mainnet } from "viem/chains";
    import { privateKeyToAccount } from "viem/accounts";

    // --- Setup (Replace with your actual values) ---
    const ROUTER_ADDRESS = "0xYourDeepWhalesRouterAddress"; // Replace with deployed router address
    const RPC_URL = "https://mainnet.infura.io/v3/YOUR_INFURA_KEY"; // Replace with your RPC endpoint
    const PRIVATE_KEY = "0xYourPrivateKey"; // Replace with your private key
    const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // Example: DAI on Mainnet
    const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Example: USDC on Mainnet
    const REFERRER_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with actual referrer or keep zero

    const account = privateKeyToAccount(PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });
    const walletClient = createWalletClient({ account, chain: mainnet, transport: http(RPC_URL) });

    const routerAbi = parseAbi([
      "function swapExactTokensForTokensV2(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 deadline, uint16 dynamicFeeBps, address referrer) external returns (uint256)",
      "event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount, uint16 feeBps, uint8 protocolType, address referrer, uint256 timestamp)",
      // Add ERC20 ABI fragment for approval
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)"
    ]);

    const daiContract = getContract({ address: DAI_ADDRESS, abi: routerAbi, client: { public: publicClient, wallet: walletClient } });

    async function swapDaiForUsdcV2() {
      const amountIn = parseUnits("100", 18); // Swap 100 DAI (18 decimals)
      const amountOutMin = parseUnits("99", 6); // Expect at least 99 USDC (6 decimals), adjust for slippage
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10); // 10 minutes from now
      const dynamicFeeBps = 0; // Use default fee

      try {
        // --- Check Allowance and Approve ---
        const currentAllowance = await daiContract.read.allowance([account.address, ROUTER_ADDRESS]);
        if (currentAllowance < amountIn) {
          console.log(`Approving router to spend ${formatUnits(amountIn, 18)} DAI...`);
          const approveHash = await daiContract.write.approve([ROUTER_ADDRESS, amountIn]);
          console.log("Approval Tx Hash:", approveHash);
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          console.log("Approval confirmed.");
        } else {
           console.log("Sufficient allowance already granted.");
        }

        // --- Execute Swap ---
        console.log("Executing swap...");
        const swapHash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "swapExactTokensForTokensV2",
          args: [DAI_ADDRESS, USDC_ADDRESS, amountIn, amountOutMin, deadline, dynamicFeeBps, REFERRER_ADDRESS],
          // Optional: specify gas limit if needed
          // gas: 300000n
        });
        console.log("Swap Tx Hash:", swapHash);

        // --- Wait for confirmation and get receipt ---
        const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
        console.log("Swap confirmed in block:", receipt.blockNumber);

        // --- Optional: Parse logs to find SwapExecuted event ---
        // Note: viem v2 has better log parsing utilities
        // This is a basic example for illustration
        const swapEvent = receipt.logs
          .map(log => {
             try { return publicClient.decodeEventLog({ abi: routerAbi, ...log }); } catch { return null; }
          })
          .find(decoded => decoded?.eventName === 'SwapExecuted');

        if (swapEvent) {
          const { amountOut } = swapEvent.args as { amountOut: bigint };
          console.log(`Successfully swapped 100 DAI for ${formatUnits(amountOut, 6)} USDC`);
        }

      } catch (error) {
        console.error("Swap failed:", error);
      }
    }

    swapDaiForUsdcV2();
    ```

    **Python Example (web3.py)**

    ```python
    from web3 import Web3
    import time
    import json

    # --- Setup (Replace with your actual values) ---
    ROUTER_ADDRESS = "0xYourDeepWhalesRouterAddress" # Replace with deployed router address
    RPC_URL = "https://mainnet.infura.io/v3/YOUR_INFURA_KEY" # Replace with your RPC endpoint
    PRIVATE_KEY = "0xYourPrivateKey" # Replace with your private key
    DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F" # Example: DAI on Mainnet
    USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" # Example: USDC on Mainnet
    REFERRER_ADDRESS = "0x0000000000000000000000000000000000000000" # Replace with actual referrer or keep zero

    # --- ABI Snippets (Add more functions as needed) ---
    ROUTER_ABI = json.loads("""
    [
      {"inputs":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint16","name":"dynamicFeeBps","type":"uint16"},{"internalType":"address","name":"referrer","type":"address"}],"name":"swapExactTokensForTokensV2","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
      {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"tokenIn","type":"address"},{"indexed":true,"internalType":"address","name":"tokenOut","type":"address"},{"indexed":false,"internalType":"uint256","name":"amountIn","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amountOut","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"feeAmount","type":"uint256"},{"indexed":false,"internalType":"uint16","name":"feeBps","type":"uint16"},{"indexed":false,"internalType":"uint8","name":"protocolType","type":"uint8"},{"indexed":false,"internalType":"address","name":"referrer","type":"address"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"SwapExecuted","type":"event"}
    ]
    """)
    ERC20_ABI = json.loads("""
    [
      {"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
      {"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}
    ]
    """)

    # --- Connect to Web3 ---
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        raise ConnectionError("Failed to connect to Web3 provider")

    account = w3.eth.account.from_key(PRIVATE_KEY)
    my_address = account.address
    print(f"Using account: {my_address}")

    router_contract = w3.eth.contract(address=ROUTER_ADDRESS, abi=ROUTER_ABI)
    dai_contract = w3.eth.contract(address=DAI_ADDRESS, abi=ERC20_ABI)

    def swap_dai_for_usdc_v2():
        amount_in = w3.to_wei(100, 'ether') # Swap 100 DAI (18 decimals)
        amount_out_min = 99 * (10**6) # Expect at least 99 USDC (6 decimals), adjust for slippage
        deadline = int(time.time()) + 60 * 10 # 10 minutes from now
        dynamic_fee_bps = 0 # Use default fee

        try:
            # --- Check Allowance and Approve ---
            current_allowance = dai_contract.functions.allowance(my_address, ROUTER_ADDRESS).call()
            if current_allowance < amount_in:
                print(f"Approving router to spend {w3.from_wei(amount_in, 'ether')} DAI...")
                approve_tx = dai_contract.functions.approve(ROUTER_ADDRESS, amount_in).build_transaction({
                    'from': my_address,
                    'nonce': w3.eth.get_transaction_count(my_address),
                    'gas': 100000, # Estimate gas appropriately
                    'gasPrice': w3.eth.gas_price
                })
                signed_approve_tx = w3.eth.account.sign_transaction(approve_tx, PRIVATE_KEY)
                approve_tx_hash = w3.eth.send_raw_transaction(signed_approve_tx.rawTransaction)
                print(f"Approval Tx Hash: {approve_tx_hash.hex()}")
                receipt = w3.eth.wait_for_transaction_receipt(approve_tx_hash)
                if receipt.status != 1:
                    raise Exception("Approval transaction failed")
                print("Approval confirmed.")
            else:
                print("Sufficient allowance already granted.")

            # --- Execute Swap ---
            print("Executing swap...")
            swap_tx = router_contract.functions.swapExactTokensForTokensV2(
                DAI_ADDRESS,
                USDC_ADDRESS,
                amount_in,
                amount_out_min,
                deadline,
                dynamic_fee_bps,
                REFERRER_ADDRESS
            ).build_transaction({
                'from': my_address,
                'nonce': w3.eth.get_transaction_count(my_address),
                'gas': 350000, # Estimate gas appropriately
                'gasPrice': w3.eth.gas_price
                # 'value': 0 # If swapping non-ETH tokens
            })

            signed_swap_tx = w3.eth.account.sign_transaction(swap_tx, PRIVATE_KEY)
            swap_tx_hash = w3.eth.send_raw_transaction(signed_swap_tx.rawTransaction)
            print(f"Swap Tx Hash: {swap_tx_hash.hex()}")

            # --- Wait for confirmation ---
            receipt = w3.eth.wait_for_transaction_receipt(swap_tx_hash)
            if receipt.status == 1:
                print(f"Swap confirmed in block: {receipt.blockNumber}")
                # --- Optional: Parse logs ---
                swap_event_abi = router_contract.events.SwapExecuted().abi
                for log in receipt['logs']:
                     # Basic matching, use a library for robust parsing if needed
                     if log['topics'][0].hex() == w3.keccak(text="SwapExecuted(address,address,address,uint256,uint256,uint256,uint16,uint8,address,uint256)").hex():
                         decoded_log = w3.codec.decode(
                             types=[item['type'] for item in swap_event_abi['inputs'] if not item['indexed']],
                             data=bytes.fromhex(log['data'][2:])
                         )
                         # Manually associate indexed topics if needed
                         amount_out_received = decoded_log[1] # Index based on non-indexed outputs
                         print(f"Successfully swapped 100 DAI for {amount_out_received / (10**6)} USDC")
                         break
            else:
                print("Swap transaction failed!")

        except Exception as e:
            print(f"An error occurred: {e}")

    swap_dai_for_usdc_v2()
    ```

2.  **`swapExactTokensForTokensV2WithTax`**

    ```solidity
    function swapExactTokensForTokensV2WithTax(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        uint16 dynamicFeeBps,      // Router fee for this specific swap, in BPS. Use 0 for default fee.
        uint16 taxAdjustmentBps,   // Expected tax/fee-on-transfer for tokenIn, in BPS, to adjust amountIn.
        address referrer
    ) external returns (uint256 amountOut);
    ```

    *   **Purpose**: Swaps an exact amount of input tokens (`tokenIn`) for output tokens (`tokenOut`) using Uniswap V2, specifically designed to handle tokens that may have transfer taxes or fees (fee-on-transfer tokens). It accounts for potential discrepancies between the amount sent by the user and the amount received by the router due to input token taxes.
    *   **Parameters**:
        *   `tokenIn`: Address of the ERC20 input token (potentially with transfer tax).
        *   `tokenOut`: Address of the ERC20 output token (potentially with transfer tax).
        *   `amountIn`: The exact amount of `tokenIn` the user intends to send *before* any potential transfer taxes are deducted by the token contract itself.
        *   `amountOutMin`: The minimum amount of `tokenOut` the caller is willing to receive *after* all fees (router fee and potential output token tax). This is compared against the final received amount.
        *   `deadline`: A Unix timestamp after which the transaction will revert.
        *   `dynamicFeeBps`: Optional router fee override in basis points (0-500). If 0, the contract's default fee is used. The fee is calculated based on the amount *actually received* by the router after any input token tax.
        *   `taxAdjustment`: An additional slippage tolerance in basis points (e.g., 100 for 1%) applied to the `amountOutMin` during the internal Uniswap V2 call. This helps account for potential output token taxes or high volatility, ensuring the swap doesn't revert prematurely due to slippage calculations within Uniswap. The final output is still checked against the original `amountOutMin`.
        *   `referrer`: Address of the referrer (use `address(0)` if none).
    *   **Return Values**:
        *   `amountOut`: The actual amount of `tokenOut` received by the caller after the swap, router fee, and any token taxes.
    *   **Side Effects**:
        *   Measures the router's `tokenIn` balance before and after the user's transfer to determine the `actualReceived` amount.
        *   Transfers `amountIn` of `tokenIn` from the caller (`msg.sender`) to the router contract (may be reduced by token tax).
        *   Calculates and collects a fee based on `actualReceived` and the applicable fee percentage.
        *   Converts and distributes the collected fee (ETH equivalent) immediately.
        *   Approves the Uniswap V2 Router to spend the `tokenIn` (amount after fee deduction).
        *   Executes the swap on Uniswap V2 using `actualReceived` (minus fee) as input and an adjusted minimum output based on `amountOutMin` and `taxAdjustment`.
        *   Transfers the resulting `amountOut` of `tokenOut` directly to the caller (`msg.sender`).
        *   Updates referral analytics.
        *   Emits `SwapExecutedWithTax`, `FeeCollection`, `FeeDistributed`, `UserReferred` (if applicable), and potentially `ReferralPaymentFailed` events.
    *   **Reverts**:
        *   Includes all reverts from `swapExactTokensForTokensV2`.
        *   `InsufficientAmount`: If `actualReceived` after input tax is zero.
        *   `InsufficientOutputAmount`: If the final `amountOut` received by the user is less than the originally specified `amountOutMin` (even if the internal Uniswap call with `taxAdjustment` succeeded).
    *   **Access Control**: None.

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous example (clients, account, ABIs)
    // Replace TAX_TOKEN_IN_ADDRESS and TAX_TOKEN_OUT_ADDRESS with actual tax token addresses

    const taxTokenInContract = getContract({ address: TAX_TOKEN_IN_ADDRESS, abi: routerAbi, client: { public: publicClient, wallet: walletClient } });

    async function swapTaxTokenV2() {
      const amountIn = parseUnits("1000", 9); // Swap 1000 of the tax token (e.g., 9 decimals)
      const amountOutMin = parseUnits("50", 18); // Expect at least 50 WETH (18 decimals), adjust for slippage & taxes
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const dynamicFeeBps = 0; // Use default fee
      const taxAdjustment = 200; // 2% additional slippage for Uniswap call (adjust based on token taxes)
      const referrer = "0x0000000000000000000000000000000000000000";

      try {
        // --- Approval (similar to previous example) ---
        const currentAllowance = await taxTokenInContract.read.allowance([account.address, ROUTER_ADDRESS]);
        if (currentAllowance < amountIn) {
          console.log(`Approving router to spend ${formatUnits(amountIn, 9)} TAX_TOKEN...`);
          const approveHash = await taxTokenInContract.write.approve([ROUTER_ADDRESS, amountIn]);
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          console.log("Approval confirmed.");
        }

        // --- Execute Swap ---
        console.log("Executing tax token swap...");
        const swapHash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi, // Ensure routerAbi includes swapExactTokensForTokensV2WithTax
          functionName: "swapExactTokensForTokensV2WithTax",
          args: [
            TAX_TOKEN_IN_ADDRESS,
            WETH_ADDRESS, // Swapping tax token for WETH
            amountIn,
            amountOutMin,
            deadline,
            dynamicFeeBps,
            taxAdjustment,
            referrer
          ],
        });
        console.log("Swap Tx Hash:", swapHash);

        const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
        console.log("Swap confirmed in block:", receipt.blockNumber);

        // --- Optional: Parse SwapExecutedWithTax event ---
        // Ensure routerAbi includes the SwapExecutedWithTax event definition
        const swapEvent = receipt.logs
          .map(log => {
             try { return publicClient.decodeEventLog({ abi: routerAbi, ...log }); } catch { return null; }
          })
          .find(decoded => decoded?.eventName === 'SwapExecutedWithTax');

         if (swapEvent) {
           const { amountInSent, amountInReceived, amountOut } = swapEvent.args as any; // Cast for simplicity
           console.log(`Sent: ${formatUnits(amountInSent, 9)} TAX_IN`);
           console.log(`Router Received: ${formatUnits(amountInReceived, 9)} TAX_IN`);
           console.log(`Received: ${formatUnits(amountOut, 18)} WETH`);
         }

      } catch (error) {
        console.error("Tax token swap failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function swapExactTokensForTokensV2WithTax(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 deadline, uint16 dynamicFeeBps, uint16 taxAdjustment, address referrer) external returns (uint256)"
    // "event SwapExecutedWithTax(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountInSent, uint256 amountInReceived, uint256 amountOut, uint256 feeAmount, uint16 feeBps, uint16 taxAdjustment, address referrer, uint256 timestamp)"

    // swapTaxTokenV2(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous example (w3, account, addresses, ABIs)
    # Replace TAX_TOKEN_IN_ADDRESS and TAX_TOKEN_OUT_ADDRESS

    tax_token_in_contract = w3.eth.contract(address=TAX_TOKEN_IN_ADDRESS, abi=ERC20_ABI)

    def swap_tax_token_v2():
        amount_in = 1000 * (10**9) # Swap 1000 tax token (9 decimals)
        amount_out_min = w3.to_wei(50, 'ether') # Expect at least 50 WETH
        deadline = int(time.time()) + 60 * 10
        dynamic_fee_bps = 0
        tax_adjustment = 200 # 2%
        referrer = "0x0000000000000000000000000000000000000000"

        try:
            # --- Approval (similar to previous example) ---
            current_allowance = tax_token_in_contract.functions.allowance(my_address, ROUTER_ADDRESS).call()
            if current_allowance < amount_in:
                print(f"Approving router to spend {amount_in / (10**9)} TAX_TOKEN...")
                approve_tx = tax_token_in_contract.functions.approve(ROUTER_ADDRESS, amount_in).build_transaction({
                    'from': my_address, 'nonce': w3.eth.get_transaction_count(my_address), 'gas': 100000, 'gasPrice': w3.eth.gas_price
                })
                signed_approve_tx = w3.eth.account.sign_transaction(approve_tx, PRIVATE_KEY)
                approve_tx_hash = w3.eth.send_raw_transaction(signed_approve_tx.rawTransaction)
                receipt = w3.eth.wait_for_transaction_receipt(approve_tx_hash)
                if receipt.status != 1: raise Exception("Approval failed")
                print("Approval confirmed.")

            # --- Execute Swap ---
            print("Executing tax token swap...")
            # Ensure ROUTER_ABI includes swapExactTokensForTokensV2WithTax definition
            swap_tx = router_contract.functions.swapExactTokensForTokensV2WithTax(
                TAX_TOKEN_IN_ADDRESS,
                WETH_ADDRESS, # Swapping tax token for WETH
                amount_in,
                amount_out_min,
                deadline,
                dynamic_fee_bps,
                tax_adjustment,
                referrer
            ).build_transaction({
                'from': my_address,
                'nonce': w3.eth.get_transaction_count(my_address),
                'gas': 400000, # Tax tokens might require more gas
                'gasPrice': w3.eth.gas_price
            })

            signed_swap_tx = w3.eth.account.sign_transaction(swap_tx, PRIVATE_KEY)
            swap_tx_hash = w3.eth.send_raw_transaction(signed_swap_tx.rawTransaction)
            print(f"Swap Tx Hash: {swap_tx_hash.hex()}")

            receipt = w3.eth.wait_for_transaction_receipt(swap_tx_hash)
            if receipt.status == 1:
                print(f"Swap confirmed in block: {receipt.blockNumber}")
                # --- Optional: Parse SwapExecutedWithTax event ---
                # Ensure ROUTER_ABI includes the event definition
                tax_swap_event_abi = router_contract.events.SwapExecutedWithTax().abi
                for log in receipt['logs']:
                     if log['topics'][0].hex() == w3.keccak(text="SwapExecutedWithTax(address,address,address,uint256,uint256,uint256,uint256,uint16,uint16,address,uint256)").hex():
                         decoded_log = w3.codec.decode(
                             types=[item['type'] for item in tax_swap_event_abi['inputs'] if not item['indexed']],
                             data=bytes.fromhex(log['data'][2:])
                         )
                         amount_in_sent = decoded_log[0]
                         amount_in_received = decoded_log[1]
                         amount_out_received = decoded_log[2]
                         print(f"Sent: {amount_in_sent / (10**9)} TAX_IN")
                         print(f"Router Received: {amount_in_received / (10**9)} TAX_IN")
                         print(f"Received: {w3.from_wei(amount_out_received, 'ether')} WETH")
                         break
            else:
                print("Tax token swap transaction failed!")

        except Exception as e:
            print(f"An error occurred: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint16","name":"dynamicFeeBps","type":"uint16"},{"internalType":"uint16","name":"taxAdjustment","type":"uint16"},{"internalType":"address","name":"referrer","type":"address"}],"name":"swapExactTokensForTokensV2WithTax","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}
    # {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"tokenIn","type":"address"},{"indexed":true,"internalType":"address","name":"tokenOut","type":"address"},{"indexed":false,"internalType":"uint256","name":"amountInSent","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amountInReceived","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amountOut","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"feeAmount","type":"uint256"},{"indexed":false,"internalType":"uint16","name":"feeBps","type":"uint16"},{"indexed":false,"internalType":"uint16","name":"taxAdjustment","type":"uint16"},{"indexed":false,"internalType":"address","name":"referrer","type":"address"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"SwapExecutedWithTax","type":"event"}

    # swap_tax_token_v2() # Uncomment to run
    ```

#### Uniswap V3

1.  **`swapExactTokensForTokensV3`**

    ```solidity
    function swapExactTokensForTokensV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        uint24 feeTier,
        uint16 dynamicFeeBps,
        address referrer
    ) external returns (uint256 amountOut)
    ```

    *   **Purpose**: Swaps an exact amount of input tokens (`tokenIn`) for a minimum amount of output tokens (`tokenOut`) using a single Uniswap V3 pool defined by the `feeTier`.
    *   **Parameters**:
        *   `tokenIn`: Address of the ERC20 token to swap from.
        *   `tokenOut`: Address of the ERC20 token to swap to.
        *   `amountIn`: The exact amount of `tokenIn` to send for the swap.
        *   `amountOutMin`: The minimum amount of `tokenOut` the caller is willing to receive (slippage protection).
        *   `deadline`: A Unix timestamp after which the transaction will revert.
        *   `feeTier`: The fee tier of the Uniswap V3 pool to use (e.g., 500, 3000, 10000). Invalid tiers default to 3000.
        *   `dynamicFeeBps`: Optional router fee override in basis points (0-500). If 0, the default fee is used.
        *   `referrer`: Address of the referrer (use `address(0)` if none).
    *   **Return Values**:
        *   `amountOut`: The actual amount of `tokenOut` received by the caller.
    *   **Side Effects**:
        *   Transfers `amountIn` of `tokenIn` from the caller to the router.
        *   Calculates, collects, converts, and distributes the router fee (ETH equivalent).
        *   Approves the Uniswap V3 Router to spend `tokenIn` (amount after fee).
        *   Executes the swap on the specified Uniswap V3 pool.
        *   Transfers the resulting `amountOut` of `tokenOut` directly to the caller.
        *   Updates referral analytics.
        *   Emits `SwapExecuted` (with `protocolType` = `PROTOCOL_TYPE_V3`), `FeeCollection`, `FeeDistributed`, `UserReferred` (if applicable), etc.
    *   **Reverts**:
        *   Includes standard reverts like `ZeroAddressNotAllowed`, `DeadlineExpired`, `InsufficientAmount`, `SelfReferralNotAllowed`, `InvalidReferrerAddress`, `FeeTooHigh`.
        *   If the underlying Uniswap V3 swap reverts (e.g., due to slippage (`TooLittleReceived`), invalid pool, etc.).
        *   If ERC20 `transferFrom` or fee distribution fails.
        *   If the contract is in an emergency state.
    *   **Access Control**: None.

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous examples

    async function swapDaiForUsdcV3() {
      const amountIn = parseUnits("100", 18); // 100 DAI
      const amountOutMin = parseUnits("99", 6); // Min 99 USDC
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const feeTier = 3000; // 0.3% pool
      const dynamicFeeBps = 0; // Default router fee
      const referrer = "0x0000000000000000000000000000000000000000";

      try {
        // --- Approval (ensure DAI approval for ROUTER_ADDRESS) ---
        // ... (Approval logic as in V2 example)

        // --- Execute Swap ---
        console.log("Executing V3 swap...");
        // Ensure routerAbi includes swapExactTokensForTokensV3 definition
        const swapHash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "swapExactTokensForTokensV3",
          args: [
            DAI_ADDRESS,
            USDC_ADDRESS,
            amountIn,
            amountOutMin,
            deadline,
            feeTier,
            dynamicFeeBps,
            referrer
          ],
        });
        console.log("V3 Swap Tx Hash:", swapHash);

        const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
        console.log("V3 Swap confirmed in block:", receipt.blockNumber);

        // --- Optional: Parse SwapExecuted event ---
        // ... (Log parsing logic as in V2 example)

      } catch (error) {
        console.error("V3 Swap failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function swapExactTokensForTokensV3(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 deadline, uint24 feeTier, uint16 dynamicFeeBps, address referrer) external returns (uint256)"

    // swapDaiForUsdcV3(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous examples

    def swap_dai_for_usdc_v3():
        amount_in = w3.to_wei(100, 'ether') # 100 DAI
        amount_out_min = 99 * (10**6) # Min 99 USDC
        deadline = int(time.time()) + 60 * 10
        fee_tier = 3000 # 0.3% pool
        dynamic_fee_bps = 0 # Default router fee
        referrer = "0x0000000000000000000000000000000000000000"

        try:
            # --- Approval (ensure DAI approval for ROUTER_ADDRESS) ---
            # ... (Approval logic as in V2 example)

            # --- Execute Swap ---
            print("Executing V3 swap...")
            # Ensure ROUTER_ABI includes swapExactTokensForTokensV3 definition
            swap_tx = router_contract.functions.swapExactTokensForTokensV3(
                DAI_ADDRESS,
                USDC_ADDRESS,
                amount_in,
                amount_out_min,
                deadline,
                fee_tier,
                dynamic_fee_bps,
                referrer
            ).build_transaction({
                'from': my_address,
                'nonce': w3.eth.get_transaction_count(my_address),
                'gas': 350000, # Estimate gas
                'gasPrice': w3.eth.gas_price
            })

            signed_swap_tx = w3.eth.account.sign_transaction(swap_tx, PRIVATE_KEY)
            swap_tx_hash = w3.eth.send_raw_transaction(signed_swap_tx.rawTransaction)
            print(f"V3 Swap Tx Hash: {swap_tx_hash.hex()}")

            receipt = w3.eth.wait_for_transaction_receipt(swap_tx_hash)
            if receipt.status == 1:
                print(f"V3 Swap confirmed in block: {receipt.blockNumber}")
                # --- Optional: Parse SwapExecuted event ---
                # ... (Log parsing logic as in V2 example)
            else:
                print("V3 Swap transaction failed!")

        except Exception as e:
            print(f"An error occurred during V3 swap: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint24","name":"feeTier","type":"uint24"},{"internalType":"uint16","name":"dynamicFeeBps","type":"uint16"},{"internalType":"address","name":"referrer","type":"address"}],"name":"swapExactTokensForTokensV3","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}

    # swap_dai_for_usdc_v3(); # Uncomment to run
    ```

2. **swapExactTokensForTokensV3MultiHop**

2.  **`swapExactTokensForTokensV3MultiHop`**

    ```solidity
    function swapExactTokensForTokensV3MultiHop(
        bytes calldata path,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline,
        uint16 dynamicFeeBps,
        address referrer
    ) external returns (uint256 amountOut)
    ```

    *   **Purpose**: Swaps an exact amount of input tokens for a minimum amount of output tokens using a multi-step path across several Uniswap V3 pools.
    *   **Parameters**:
        *   `path`: An encoded byte string representing the sequence of tokens and pool fee tiers. Use the `encodePath` helper function or construct manually as `abi.encodePacked(token0, fee01, token1, fee12, token2, ...)`.
        *   `amountIn`: The exact amount of the first token in the `path` to send for the swap.
        *   `amountOutMin`: The minimum amount of the last token in the `path` the caller is willing to receive.
        *   `deadline`: A Unix timestamp after which the transaction will revert.
        *   `dynamicFeeBps`: Optional router fee override in basis points (0-500). Applied to the initial `amountIn`.
        *   `referrer`: Address of the referrer (use `address(0)` if none).
    *   **Return Values**:
        *   `amountOut`: The actual amount of the final token in the `path` received by the caller.
    *   **Side Effects**:
        *   Transfers `amountIn` of the initial token from the caller to the router.
        *   Calculates, collects, converts, and distributes the router fee (ETH equivalent).
        *   Approves the Uniswap V3 Router to spend the initial token (amount after fee).
        *   Executes the multi-hop swap on Uniswap V3 following the specified `path`.
        *   Transfers the resulting `amountOut` of the final token directly to the caller.
        *   Updates referral analytics.
        *   Emits `SwapExecuted` (with `protocolType` = `PROTOCOL_TYPE_V3_MULTI`), `FeeCollection`, `FeeDistributed`, `UserReferred` (if applicable), etc.
    *   **Reverts**:
        *   Includes standard reverts like `DeadlineExpired`, `InsufficientAmount`, `SelfReferralNotAllowed`, `InvalidReferrerAddress`, `FeeTooHigh`.
        *   `PathTooShort`: If the `path` byte length is invalid.
        *   If the underlying Uniswap V3 swap reverts (e.g., `TooLittleReceived`, invalid path segment, pool doesn't exist).
        *   If ERC20 `transferFrom` or fee distribution fails.
        *   If the contract is in an emergency state.
    *   **Access Control**: None.

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous examples
    // Need WETH_ADDRESS for multi-hop example (DAI -> WETH -> USDC)
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // Mainnet WETH

    async function swapDaiToUsdcV3MultiHop() {
      const amountIn = parseUnits("100", 18); // 100 DAI
      const amountOutMin = parseUnits("98", 6); // Min 98 USDC (adjust for multi-hop slippage)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);
      const dynamicFeeBps = 0;
      const referrer = "0x0000000000000000000000000000000000000000";

      // --- Encode Path (DAI -> WETH -> USDC) ---
      // Use appropriate fee tiers for each hop (e.g., 3000 for DAI/WETH, 500 for WETH/USDC)
      const tokens = [DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS];
      const fees = [3000, 500]; // Fee tiers for DAI->WETH and WETH->USDC pools

      // Use encodePacked from viem or ethers, or call the contract's encodePath helper
      // Example using viem's encodePacked (requires viem >= 1.x or specific import)
      // import { encodePacked } from 'viem'; // Or from 'ethers'
      // const path = encodePacked(
      //   ['address', 'uint24', 'address', 'uint24', 'address'],
      //   [tokens[0], fees[0], tokens[1], fees[1], tokens[2]]
      // );
      // OR call the contract's helper (requires adding encodePath to ABI)
      const path = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi, // Ensure routerAbi includes encodePath
          functionName: "encodePath",
          args: [tokens, fees]
      }) as `0x${string}`; // Type assertion

      console.log("Encoded Path:", path);

      try {
        // --- Approval (ensure DAI approval for ROUTER_ADDRESS) ---
        // ... (Approval logic as in V2 example)

        // --- Execute Swap ---
        console.log("Executing V3 Multi-Hop swap...");
        // Ensure routerAbi includes swapExactTokensForTokensV3MultiHop definition
        const swapHash = await walletClient.writeContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "swapExactTokensForTokensV3MultiHop",
          args: [
            path,
            amountIn,
            amountOutMin,
            deadline,
            dynamicFeeBps,
            referrer
          ],
        });
        console.log("V3 Multi-Hop Swap Tx Hash:", swapHash);

        const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
        console.log("V3 Multi-Hop Swap confirmed in block:", receipt.blockNumber);

        // --- Optional: Parse SwapExecuted event ---
        // ... (Log parsing logic as in V2 example, check protocolType == 3)

      } catch (error) {
        console.error("V3 Multi-Hop Swap failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function encodePath(address[] calldata tokens, uint24[] calldata fees) public pure returns (bytes memory)"
    // "function swapExactTokensForTokensV3MultiHop(bytes calldata path, uint256 amountIn, uint256 amountOutMin, uint256 deadline, uint16 dynamicFeeBps, address referrer) external returns (uint256)"

    // swapDaiToUsdcV3MultiHop(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous examples
    # Need WETH_ADDRESS
    WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" # Mainnet WETH

    def swap_dai_to_usdc_v3_multi_hop():
        amount_in = w3.to_wei(100, 'ether') # 100 DAI
        amount_out_min = 98 * (10**6) # Min 98 USDC
        deadline = int(time.time()) + 60 * 10
        dynamic_fee_bps = 0
        referrer = "0x0000000000000000000000000000000000000000"

        # --- Encode Path (DAI -> WETH -> USDC) ---
        tokens = [DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS]
        fees = [3000, 500] # Fee tiers for DAI->WETH and WETH->USDC pools

        # Call the contract's encodePath helper function
        # Ensure ROUTER_ABI includes encodePath definition
        try:
            path = router_contract.functions.encodePath(tokens, fees).call()
            print(f"Encoded Path: {path.hex()}")
        except Exception as e:
            print(f"Failed to encode path: {e}")
            return

        try:
            # --- Approval (ensure DAI approval for ROUTER_ADDRESS) ---
            # ... (Approval logic as in V2 example)

            # --- Execute Swap ---
            print("Executing V3 Multi-Hop swap...")
            # Ensure ROUTER_ABI includes swapExactTokensForTokensV3MultiHop definition
            swap_tx = router_contract.functions.swapExactTokensForTokensV3MultiHop(
                path,
                amount_in,
                amount_out_min,
                deadline,
                dynamic_fee_bps,
                referrer
            ).build_transaction({
                'from': my_address,
                'nonce': w3.eth.get_transaction_count(my_address),
                'gas': 450000, # Multi-hop might require more gas
                'gasPrice': w3.eth.gas_price
            })

            signed_swap_tx = w3.eth.account.sign_transaction(swap_tx, PRIVATE_KEY)
            swap_tx_hash = w3.eth.send_raw_transaction(signed_swap_tx.rawTransaction)
            print(f"V3 Multi-Hop Swap Tx Hash: {swap_tx_hash.hex()}")

            receipt = w3.eth.wait_for_transaction_receipt(swap_tx_hash)
            if receipt.status == 1:
                print(f"V3 Multi-Hop Swap confirmed in block: {receipt.blockNumber}")
                # --- Optional: Parse SwapExecuted event ---
                # ... (Log parsing logic as in V2 example, check protocolType == 3)
            else:
                print("V3 Multi-Hop Swap transaction failed!")

        except Exception as e:
            print(f"An error occurred during V3 Multi-Hop swap: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address[]","name":"tokens","type":"address[]"},{"internalType":"uint24[]","name":"fees","type":"uint24[]"}],"name":"encodePath","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"pure","type":"function"}
    # {"inputs":[{"internalType":"bytes","name":"path","type":"bytes"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint16","name":"dynamicFeeBps","type":"uint16"},{"internalType":"address","name":"referrer","type":"address"}],"name":"swapExactTokensForTokensV3MultiHop","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}

    # swap_dai_to_usdc_v3_multi_hop(); # Uncomment to run
    ```

### Quote Functions

### Quote Functions

These functions help estimate swap outputs before execution, accounting for potential router fees.

1.  **`getExpectedOutputV2`**

    ```solidity
    function getExpectedOutputV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 feeBps
    ) external view returns (uint256 expectedOutput, uint256 afterFeeAmount)
    ```

    *   **Purpose**: Calculates the expected output amount for a Uniswap V2 swap *after* deducting the specified router fee (`feeBps`) from the input amount. Useful for UI display.
    *   **Parameters**:
        *   `tokenIn`: Address of the input token.
        *   `tokenOut`: Address of the output token.
        *   `amountIn`: The total input amount *before* the router fee.
        *   `feeBps`: The router fee in basis points (0-500) to simulate. Use 0 to simulate the default fee if fees are enabled, or pass the specific dynamic fee you intend to use.
    *   **Return Values**:
        *   `expectedOutput`: The estimated amount of `tokenOut` received from Uniswap V2 after the simulated fee deduction.
        *   `afterFeeAmount`: The amount of `tokenIn` remaining after deducting the simulated fee, which is used as the input for the Uniswap V2 quote.
    *   **Side Effects**: None (view function).
    *   **Reverts**:
        *   `FeeTooHigh`: If `feeBps` > `MAX_FEE_BPS`.
        *   Can revert if the underlying `uniswapV2Router.getAmountsOut` call reverts (e.g., no liquidity).
    *   **Access Control**: None.

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous examples

    async function quoteDaiForUsdcV2() {
      const amountIn = parseUnits("100", 18); // 100 DAI
      const feeBps = 30; // Simulate a 0.3% router fee (30 bps)

      try {
        // Ensure routerAbi includes getExpectedOutputV2 definition
        const [expectedOutput, afterFeeAmount] = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getExpectedOutputV2",
          args: [DAI_ADDRESS, USDC_ADDRESS, amountIn, feeBps],
        });

        console.log(`Quoting 100 DAI for USDC (V2) with ${feeBps} bps fee:`);
        console.log(`  Amount After Fee (DAI): ${formatUnits(afterFeeAmount, 18)}`);
        console.log(`  Expected Output (USDC): ${formatUnits(expectedOutput, 6)}`); // USDC has 6 decimals

      } catch (error) {
        console.error("V2 Quote failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function getExpectedOutputV2(address tokenIn, address tokenOut, uint256 amountIn, uint16 feeBps) external view returns (uint256 expectedOutput, uint256 afterFeeAmount)"

    // quoteDaiForUsdcV2(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous examples

    def quote_dai_for_usdc_v2():
        amount_in = w3.to_wei(100, 'ether') # 100 DAI
        fee_bps = 30 # Simulate 0.3% router fee

        try:
            # Ensure ROUTER_ABI includes getExpectedOutputV2 definition
            expected_output, after_fee_amount = router_contract.functions.getExpectedOutputV2(
                DAI_ADDRESS,
                USDC_ADDRESS,
                amount_in,
                fee_bps
            ).call()

            print(f"Quoting 100 DAI for USDC (V2) with {fee_bps} bps fee:")
            print(f"  Amount After Fee (DAI): {w3.from_wei(after_fee_amount, 'ether')}")
            print(f"  Expected Output (USDC): {expected_output / (10**6)}") # USDC has 6 decimals

        except Exception as e:
            print(f"An error occurred during V2 quote: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint16","name":"feeBps","type":"uint16"}],"name":"getExpectedOutputV2","outputs":[{"internalType":"uint256","name":"expectedOutput","type":"uint256"},{"internalType":"uint256","name":"afterFeeAmount","type":"uint256"}],"stateMutability":"view","type":"function"}

    # quote_dai_for_usdc_v2(); # Uncomment to run
    ```

2. **getExpectedOutputV3**

2.  **`getExpectedOutputV3`**

    ```solidity
    function getExpectedOutputV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 feeTier,
        uint16 feeBps
    ) external returns (uint256 expectedOutput, uint256 afterFeeAmount)
    ```

    *   **Purpose**: Calculates the expected output amount for a single-pool Uniswap V3 swap *after* deducting the specified router fee (`feeBps`) from the input amount. Uses the Uniswap V3 Quoter contract.
    *   **Parameters**:
        *   `tokenIn`: Address of the input token.
        *   `tokenOut`: Address of the output token.
        *   `amountIn`: The total input amount *before* the router fee.
        *   `feeTier`: The fee tier of the Uniswap V3 pool to quote against (e.g., 500, 3000, 10000).
        *   `feeBps`: The router fee in basis points (0-500) to simulate.
    *   **Return Values**:
        *   `expectedOutput`: The estimated amount of `tokenOut` received from the Uniswap V3 pool after the simulated fee deduction.
        *   `afterFeeAmount`: The amount of `tokenIn` remaining after deducting the simulated fee, used as input for the V3 quote.
    *   **Side Effects**: May interact with the Uniswap V3 Quoter contract, which could potentially modify state (hence function is `external`, not `view`).
    *   **Reverts**:
        *   `FeeTooHigh`: If `feeBps` > `MAX_FEE_BPS`.
        *   Can revert if the underlying `uniswapV3Quoter.quoteExactInputSingle` call reverts (e.g., invalid pool, no liquidity).
    *   **Access Control**: None.

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous examples

    async function quoteDaiForUsdcV3() {
      const amountIn = parseUnits("100", 18); // 100 DAI
      const feeTier = 3000; // 0.3% pool
      const feeBps = 30; // Simulate 0.3% router fee

      try {
        // Ensure routerAbi includes getExpectedOutputV3 definition
        // Note: This is NOT a view function due to Quoter interaction
        const [expectedOutput, afterFeeAmount] = await publicClient.readContract({ // Use readContract for non-view calls without sending tx
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getExpectedOutputV3",
          args: [DAI_ADDRESS, USDC_ADDRESS, amountIn, feeTier, feeBps],
          // If your setup requires simulating state changes, use callContract or simulateContract
        });

        console.log(`Quoting 100 DAI for USDC (V3, ${feeTier} tier) with ${feeBps} bps fee:`);
        console.log(`  Amount After Fee (DAI): ${formatUnits(afterFeeAmount, 18)}`);
        console.log(`  Expected Output (USDC): ${formatUnits(expectedOutput, 6)}`);

      } catch (error) {
        console.error("V3 Quote failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function getExpectedOutputV3(address tokenIn, address tokenOut, uint256 amountIn, uint24 feeTier, uint16 feeBps) external returns (uint256 expectedOutput, uint256 afterFeeAmount)"

    // quoteDaiForUsdcV3(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous examples

    def quote_dai_for_usdc_v3():
        amount_in = w3.to_wei(100, 'ether') # 100 DAI
        fee_tier = 3000 # 0.3% pool
        fee_bps = 30 # Simulate 0.3% router fee

        try:
            # Ensure ROUTER_ABI includes getExpectedOutputV3 definition
            # Note: Use call() for non-view functions if you don't need to send a transaction
            expected_output, after_fee_amount = router_contract.functions.getExpectedOutputV3(
                DAI_ADDRESS,
                USDC_ADDRESS,
                amount_in,
                fee_tier,
                fee_bps
            ).call() # Use .call() for read-only access even if not strictly 'view'

            print(f"Quoting 100 DAI for USDC (V3, {fee_tier} tier) with {fee_bps} bps fee:")
            print(f"  Amount After Fee (DAI): {w3.from_wei(after_fee_amount, 'ether')}")
            print(f"  Expected Output (USDC): {expected_output / (10**6)}")

        except Exception as e:
            print(f"An error occurred during V3 quote: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint24","name":"feeTier","type":"uint24"},{"internalType":"uint16","name":"feeBps","type":"uint16"}],"name":"getExpectedOutputV3","outputs":[{"internalType":"uint256","name":"expectedOutput","type":"uint256"},{"internalType":"uint256","name":"afterFeeAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}
    # Note: ABI lists nonPayable, but call() works for read simulation

    # quote_dai_for_usdc_v3(); # Uncomment to run
    ```

3. **estimateOutputWithTax**

3.  **`estimateOutputWithTax`**

    ```solidity
    function estimateOutputWithTax(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 taxInBps,
        uint16 taxOutBps,
        uint16 feeBps
    ) external view returns (uint256 expectedOutput, uint256 afterTaxAndFee)
    ```

    *   **Purpose**: Estimates the final output amount for a Uniswap V2 swap involving potential fee-on-transfer tokens for both input and output, also accounting for the router fee.
    *   **Parameters**:
        *   `tokenIn`: Address of the input token.
        *   `tokenOut`: Address of the output token.
        *   `amountIn`: The total input amount *before* any input token tax.
        *   `taxInBps`: Estimated transfer tax for `tokenIn` in basis points (e.g., 100 for 1%).
        *   `taxOutBps`: Estimated transfer tax for `tokenOut` in basis points.
        *   `feeBps`: The router fee in basis points (0-500) to simulate. Applied *after* `taxInBps` is deducted.
    *   **Return Values**:
        *   `expectedOutput`: The estimated final amount of `tokenOut` received by the user after input tax, router fee, V2 swap, and output tax.
        *   `afterTaxAndFee`: The amount of `tokenIn` remaining after deducting both the simulated input tax (`taxInBps`) and the router fee (`feeBps`), which is used as the input for the internal V2 quote.
    *   **Side Effects**: None (view function). Uses Uniswap V2 `getAmountsOut` internally for estimation.
    *   **Reverts**:
        *   `FeeTooHigh`: If `feeBps` > `MAX_FEE_BPS`.
        *   Can revert if the internal `uniswapV2Router.getAmountsOut` call reverts.
    *   **Access Control**: None.

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous examples

    async function estimateTaxSwapOutput() {
      const amountIn = parseUnits("1000", 9); // 1000 TAX_TOKEN_IN
      const taxInBps = 100; // 1% input tax
      const taxOutBps = 50; // 0.5% output tax (e.g., swapping for another tax token)
      const feeBps = 30; // 0.3% router fee

      try {
        // Ensure routerAbi includes estimateOutputWithTax definition
        const [expectedOutput, afterTaxAndFee] = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "estimateOutputWithTax",
          args: [TAX_TOKEN_IN_ADDRESS, TAX_TOKEN_OUT_ADDRESS, amountIn, taxInBps, taxOutBps, feeBps],
        });

        console.log(`Estimating Tax Swap (V2) with InTax=${taxInBps}bps, OutTax=${taxOutBps}bps, RouterFee=${feeBps}bps:`);
        console.log(`  Input Amount (Before Tax): ${formatUnits(amountIn, 9)} TAX_IN`);
        console.log(`  Amount After Input Tax & Router Fee: ${formatUnits(afterTaxAndFee, 9)} TAX_IN`);
        console.log(`  Estimated Final Output (After Output Tax): ${formatUnits(expectedOutput, 18)} TAX_OUT`); // Assuming TAX_OUT has 18 decimals

      } catch (error) {
        console.error("Tax Estimation failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function estimateOutputWithTax(address tokenIn, address tokenOut, uint256 amountIn, uint16 taxInBps, uint16 taxOutBps, uint16 feeBps) external view returns (uint256 expectedOutput, uint256 afterTaxAndFee)"

    // estimateTaxSwapOutput(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous examples

    def estimate_tax_swap_output():
        amount_in = 1000 * (10**9) # 1000 TAX_TOKEN_IN (9 decimals)
        tax_in_bps = 100 # 1%
        tax_out_bps = 50 # 0.5%
        fee_bps = 30 # 0.3%

        try:
            # Ensure ROUTER_ABI includes estimateOutputWithTax definition
            expected_output, after_tax_and_fee = router_contract.functions.estimateOutputWithTax(
                TAX_TOKEN_IN_ADDRESS,
                TAX_TOKEN_OUT_ADDRESS, # Swapping for another hypothetical tax token
                amount_in,
                tax_in_bps,
                tax_out_bps,
                fee_bps
            ).call()

            print(f"Estimating Tax Swap (V2) with InTax={tax_in_bps}bps, OutTax={tax_out_bps}bps, RouterFee={fee_bps}bps:")
            print(f"  Input Amount (Before Tax): {amount_in / (10**9)} TAX_IN")
            print(f"  Amount After Input Tax & Router Fee: {after_tax_and_fee / (10**9)} TAX_IN")
            print(f"  Estimated Final Output (After Output Tax): {w3.from_wei(expected_output, 'ether')} TAX_OUT") # Assuming TAX_OUT has 18 decimals

        except Exception as e:
            print(f"An error occurred during tax estimation: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint16","name":"taxInBps","type":"uint16"},{"internalType":"uint16","name":"taxOutBps","type":"uint16"},{"internalType":"uint16","name":"feeBps","type":"uint16"}],"name":"estimateOutputWithTax","outputs":[{"internalType":"uint256","name":"expectedOutput","type":"uint256"},{"internalType":"uint256","name":"afterTaxAndFee","type":"uint256"}],"stateMutability":"view","type":"function"}

    # estimate_tax_swap_output(); # Uncomment to run
    ```

### Helper Functions

### Helper Functions

1.  **`encodePath`**

    ```solidity
    function encodePath(
        address[] calldata tokens,
        uint24[] calldata fees
    ) public pure returns (bytes memory)
    ```

    *   **Purpose**: Encodes a sequence of token addresses and Uniswap V3 pool fee tiers into the `bytes` format required by the `swapExactTokensForTokensV3MultiHop` function.
    *   **Parameters**:
        *   `tokens`: An array of token addresses representing the swap path (e.g., `[TokenA, TokenB, TokenC]`). Must contain at least 2 tokens.
        *   `fees`: An array of Uniswap V3 pool fee tiers corresponding to the hops between tokens (e.g., `[FeeAB, FeeBC]`). The length must be exactly one less than the length of the `tokens` array. Valid fee tiers are typically 500, 3000, or 10000.
    *   **Return Values**:
        *   `path`: The ABI-encoded byte string representing the multi-hop path (e.g., `abi.encodePacked(TokenA, FeeAB, TokenB, FeeBC, TokenC)`).
    *   **Side Effects**: None (pure function).
    *   **Reverts**:
        *   `PathTooShort`: If `tokens.length` is less than 2.
        *   `FeesLengthMismatch`: If `fees.length` is not equal to `tokens.length - 1`.
    *   **Access Control**: None (public pure function).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup from previous examples
    // const publicClient, ROUTER_ADDRESS, routerAbi, DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS

    async function getEncodedPathV3() {
      const tokens = [DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS]; // Path: DAI -> WETH -> USDC
      const fees = [3000, 500]; // Fee tiers: 0.3% for DAI/WETH, 0.05% for WETH/USDC

      try {
        // Ensure routerAbi includes encodePath definition
        const encodedPath = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "encodePath",
          args: [tokens, fees],
        });

        console.log(`Encoding path ${tokens.join(' -> ')} with fees ${fees.join(', ')}:`);
        console.log(`  Encoded Path: ${encodedPath}`);
        // Example Output: 0x6b175474e89094c44da98b954eedeac495271d0f000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48

      } catch (error) {
        console.error("Path encoding failed:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function encodePath(address[] calldata tokens, uint24[] calldata fees) public pure returns (bytes memory)"

    // getEncodedPathV3(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup from previous examples
    # const w3, router_contract, ROUTER_ABI, DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS

    def get_encoded_path_v3():
        tokens = [DAI_ADDRESS, WETH_ADDRESS, USDC_ADDRESS] # Path: DAI -> WETH -> USDC
        fees = [3000, 500] # Fee tiers: 0.3% for DAI/WETH, 0.05% for WETH/USDC

        try:
            # Ensure ROUTER_ABI includes encodePath definition
            encoded_path = router_contract.functions.encodePath(tokens, fees).call()

            print(f"Encoding path { ' -> '.join(tokens) } with fees { ', '.join(map(str, fees)) }:")
            print(f"  Encoded Path: {encoded_path.hex()}")
            # Example Output: 0x6b175474e89094c44da98b954eedeac495271d0f000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48

        except Exception as e:
            print(f"An error occurred during path encoding: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[{"internalType":"address[]","name":"tokens","type":"address[]"},{"internalType":"uint24[]","name":"fees","type":"uint24[]"}],"name":"encodePath","outputs":[{"internalType":"bytes","name":"","type":"bytes"}],"stateMutability":"pure","type":"function"}

    # get_encoded_path_v3(); # Uncomment to run
    ```

### Fee, Referral, and Slippage Management

### Fee, Referral, and Slippage Management (Admin Only)

These functions require the `FEE_MANAGER_ROLE` and are typically not called by standard integrators.

-   **`setDefaultFeeBps(uint16 newFeeBps)`**: Sets the default router fee percentage (0-500 bps).
-   **`setFeesEnabled(bool enabled)`**: Enables or disables router fee collection globally.
-   **`setFeeBeneficiary(address newBeneficiary)`**: Sets the address that receives the main portion of collected fees.
-   **`setReferralPercentage(uint8 newPercentage)`**: Sets the percentage (0-100) of the collected fee distributed to referrers.
-   **`setSlippageTolerance(uint16 newTolerance)`**: Sets the default slippage tolerance (0-1000 bps) used when converting collected fee tokens to ETH.
-   **`setTokenSlippageTolerance(address token, uint16 tolerance)`**: Sets a specific slippage tolerance (0-1000 bps) for converting a particular fee token to ETH (overrides the default).
-   **`convertTokenToETH(address token, uint256 amount)`**: Manually converts a specified amount of token to ETH using Uniswap V2 with the configured slippage tolerance.

### Emergency Controls (Admin Only)

These functions require specific admin roles (`EMERGENCY_ADMIN_ROLE` or `DEFAULT_ADMIN_ROLE`).

-   **`activateEmergency(string calldata reason)`**: Activates the emergency state, pausing most swap functions. Requires `EMERGENCY_ADMIN_ROLE`.
-   **`deactivateEmergency()`**: Deactivates the emergency state, resuming normal operation. Requires `DEFAULT_ADMIN_ROLE`.
-   **`emergencyRecoverStuckTokens(address token, address recipient)`**: Allows recovery of ETH or ERC20 tokens stuck in the contract *only* during an emergency state. Requires `EMERGENCY_ADMIN_ROLE`.
-   **`isEmergencyActive()`**: Returns whether the contract is currently in emergency state (view function).

### Utility Functions

-   **`encodePath(address[] calldata tokens, uint24[] calldata fees)`**: Encodes a path for Uniswap V3 multi-hop swaps. Takes an array of tokens and fees and returns the encoded path bytes.

### Analytics and Reporting Functions

These public view/external functions provide data about the router's state, configuration, and performance.

1.  **`getFeeSettings`**

    ```solidity
    function getFeeSettings() external view returns (
        uint16 defaultFeeBps,
        bool feesEnabled,
        address feeBeneficiary,
        uint8 referralPercentage,
        uint16 slippageTolerance
    )
    ```

    *   **Purpose**: Retrieves the current core fee and referral configuration settings.
    *   **Parameters**: None.
    *   **Return Values**:
        *   `defaultFeeBps`: The default fee percentage in basis points (0-500). Returns 0 if `feesEnabled` is false.
        *   `feesEnabled`: Boolean indicating if router fees are currently active.
        *   `feeBeneficiary`: The address receiving the non-referrer portion of fees.
        *   `referralPercentage`: The percentage (0-100) of the fee allocated to referrers.
        *   `slippageTolerance`: The default slippage tolerance (in bps) used for converting fee tokens to ETH.
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup: publicClient, ROUTER_ADDRESS, routerAbi

    async function fetchFeeSettings() {
      try {
        // Ensure routerAbi includes getFeeSettings definition
        const settings = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getFeeSettings",
        });

        // Destructure the returned tuple (order matters)
        const [defaultFeeBps, feesEnabled, feeBeneficiary, referralPercentage, slippageTolerance] = settings;

        console.log("Current Fee Settings:");
        console.log(`  Fees Enabled: ${feesEnabled}`);
        console.log(`  Default Fee (bps): ${defaultFeeBps}`); // Will be 0 if feesEnabled is false
        console.log(`  Fee Beneficiary: ${feeBeneficiary}`);
        console.log(`  Referral Percentage: ${referralPercentage}%`);
        console.log(`  Default Fee Conversion Slippage (bps): ${slippageTolerance}`);

      } catch (error) {
        console.error("Failed to fetch fee settings:", error);
      }
    }

    // Ensure routerAbi includes:
    // "function getFeeSettings() external view returns (uint16 defaultFeeBps, bool feesEnabled, address feeBeneficiary, uint8 referralPercentage, uint16 slippageTolerance)"

    // fetchFeeSettings(); // Uncomment to run
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup: w3, router_contract, ROUTER_ABI

    def fetch_fee_settings():
        try:
            # Ensure ROUTER_ABI includes getFeeSettings definition
            settings = router_contract.functions.getFeeSettings().call()

            # Destructure the returned tuple
            default_fee_bps, fees_enabled, fee_beneficiary, referral_percentage, slippage_tolerance = settings

            print("Current Fee Settings:")
            print(f"  Fees Enabled: {fees_enabled}")
            print(f"  Default Fee (bps): {default_fee_bps}") # Will be 0 if fees_enabled is False
            print(f"  Fee Beneficiary: {fee_beneficiary}")
            print(f"  Referral Percentage: {referral_percentage}%")
            print(f"  Default Fee Conversion Slippage (bps): {slippage_tolerance}")

        except Exception as e:
            print(f"An error occurred fetching fee settings: {e}")

    # Ensure ROUTER_ABI includes:
    # {"inputs":[],"name":"getFeeSettings","outputs":[{"internalType":"uint16","name":"defaultFeeBps","type":"uint16"},{"internalType":"bool","name":"feesEnabled","type":"bool"},{"internalType":"address","name":"feeBeneficiary","type":"address"},{"internalType":"uint8","name":"referralPercentage_","type":"uint8"},{"internalType":"uint16","name":"slippageTolerance","type":"uint16"}],"stateMutability":"view","type":"function"}
    # Note: Return variable name mismatch in Solidity (referralPercentage_) vs. documentation is handled by position.

    # fetch_fee_settings(); # Uncomment to run
    ```

2.  **`isEmergencyActive`**

    ```solidity
    function isEmergencyActive() external view returns (bool)
    ```

    *   **Purpose**: Checks if the contract's emergency state (circuit breaker) is currently active.
    *   **Parameters**: None.
    *   **Return Values**:
        *   `bool`: `true` if emergency mode is active, `false` otherwise.
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function checkEmergencyStatus() {
      try {
        // Ensure routerAbi includes isEmergencyActive definition
        const isActive = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "isEmergencyActive",
        });
        console.log(`Emergency Mode Active: ${isActive}`);
      } catch (error) {
        console.error("Failed to check emergency status:", error);
      }
    }
    // Ensure routerAbi includes: "function isEmergencyActive() external view returns (bool)"
    // checkEmergencyStatus();
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def check_emergency_status():
        try:
            # Ensure ROUTER_ABI includes isEmergencyActive definition
            is_active = router_contract.functions.isEmergencyActive().call()
            print(f"Emergency Mode Active: {is_active}")
        except Exception as e:
            print(f"An error occurred checking emergency status: {e}")

    # Ensure ROUTER_ABI includes: {"inputs":[],"name":"isEmergencyActive","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"}
    # check_emergency_status();
    ```

3.  **`getReferralPercentage`**

    ```solidity
    function getReferralPercentage() external view returns (uint8)
    ```

    *   **Purpose**: Retrieves the current percentage of the collected fee that is allocated to referrers.
    *   **Parameters**: None.
    *   **Return Values**:
        *   `uint8`: The referral percentage (0-100).
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function fetchReferralPercentage() {
      try {
        // Ensure routerAbi includes getReferralPercentage definition
        const percentage = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getReferralPercentage",
        });
        console.log(`Current Referral Percentage: ${percentage}%`);
      } catch (error) {
        console.error("Failed to fetch referral percentage:", error);
      }
    }
    // Ensure routerAbi includes: "function getReferralPercentage() external view returns (uint8)"
    // fetchReferralPercentage();
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def fetch_referral_percentage():
        try:
            # Ensure ROUTER_ABI includes getReferralPercentage definition
            percentage = router_contract.functions.getReferralPercentage().call()
            print(f"Current Referral Percentage: {percentage}%")
        except Exception as e:
            print(f"An error occurred fetching referral percentage: {e}")

    # Ensure ROUTER_ABI includes: {"inputs":[],"name":"getReferralPercentage","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"}
    # fetch_referral_percentage();
    ```

4.  **`getSlippageToleranceForToken`**

    ```solidity
    function getSlippageToleranceForToken(address token) public view returns (uint16)
    ```

    *   **Purpose**: Retrieves the specific slippage tolerance (in basis points) used when converting a particular `token` fee into ETH. If no specific tolerance is set for the token, it returns the default slippage tolerance.
    *   **Parameters**:
        *   `token`: The address of the fee token to check.
    *   **Return Values**:
        *   `uint16`: The applicable slippage tolerance in basis points (0-1000).
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function getTokenSlippage(tokenAddress) {
      try {
        // Ensure routerAbi includes getSlippageToleranceForToken definition
        const tolerance = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getSlippageToleranceForToken",
          args: [tokenAddress],
        });
        console.log(`Slippage tolerance for token ${tokenAddress}: ${tolerance} bps`);
      } catch (error) {
        console.error("Failed to get token slippage:", error);
      }
    }
    // Example: getTokenSlippage(DAI_ADDRESS);
    // Ensure routerAbi includes: "function getSlippageToleranceForToken(address token) public view returns (uint16)"
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def get_token_slippage(token_address):
        try:
            # Ensure ROUTER_ABI includes getSlippageToleranceForToken definition
            tolerance = router_contract.functions.getSlippageToleranceForToken(token_address).call()
            print(f"Slippage tolerance for token {token_address}: {tolerance} bps")
        except Exception as e:
            print(f"An error occurred getting token slippage: {e}")

    # Example: get_token_slippage(DAI_ADDRESS)
    # Ensure ROUTER_ABI includes: {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"getSlippageToleranceForToken","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"}
    ```

5.  **`getReferrerStats`**

    *   **Purpose**: Retrieves the specific slippage tolerance (in basis points) used when converting a particular `token` fee into ETH. If no specific tolerance is set for the token, it returns the default slippage tolerance.
    *   **Parameters**:
        *   `token`: The address of the fee token to check.
    *   **Return Values**:
        *   `uint16`: The applicable slippage tolerance in basis points (0-1000).
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function getTokenSlippage(tokenAddress) {
      try {
        // Ensure routerAbi includes getSlippageToleranceForToken definition
        const tolerance = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getSlippageToleranceForToken",
          args: [tokenAddress],
        });
        console.log(`Slippage tolerance for token ${tokenAddress}: ${tolerance} bps`);
      } catch (error) {
        console.error("Failed to get token slippage:", error);
      }
    }
    // Example: getTokenSlippage(DAI_ADDRESS);
    // Ensure routerAbi includes: "function getSlippageToleranceForToken(address token) public view returns (uint16)"
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def get_token_slippage(token_address):
        try:
            # Ensure ROUTER_ABI includes getSlippageToleranceForToken definition
            tolerance = router_contract.functions.getSlippageToleranceForToken(token_address).call()
            print(f"Slippage tolerance for token {token_address}: {tolerance} bps")
        except Exception as e:
            print(f"An error occurred getting token slippage: {e}")

    # Example: get_token_slippage(DAI_ADDRESS)
    # Ensure ROUTER_ABI includes: {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"getSlippageToleranceForToken","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"}
    ```

    ```solidity
    function getSlippageToleranceForToken(address token) public view returns (uint16)
    ```

    *   **Purpose**: Retrieves the specific slippage tolerance (in basis points) used when converting a particular `token` fee into ETH. If no specific tolerance is set for the token, it returns the default slippage tolerance.
    *   **Parameters**:
        *   `token`: The address of the fee token to check.
    *   **Return Values**:
        *   `uint16`: The applicable slippage tolerance in basis points (0-1000).
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function getTokenSlippage(tokenAddress) {
      try {
        // Ensure routerAbi includes getSlippageToleranceForToken definition
        const tolerance = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getSlippageToleranceForToken",
          args: [tokenAddress],
        });
        console.log(`Slippage tolerance for token ${tokenAddress}: ${tolerance} bps`);
      } catch (error) {
        console.error("Failed to get token slippage:", error);
      }
    }
    // Example: getTokenSlippage(DAI_ADDRESS);
    // Ensure routerAbi includes: "function getSlippageToleranceForToken(address token) public view returns (uint16)"
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def get_token_slippage(token_address):
        try:
            # Ensure ROUTER_ABI includes getSlippageToleranceForToken definition
            tolerance = router_contract.functions.getSlippageToleranceForToken(token_address).call()
            print(f"Slippage tolerance for token {token_address}: {tolerance} bps")
        except Exception as e:
            print(f"An error occurred getting token slippage: {e}")

    # Example: get_token_slippage(DAI_ADDRESS)
    # Ensure ROUTER_ABI includes: {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"getSlippageToleranceForToken","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"}
    ```

6.  **`getReferrerStats`**

    ```solidity
    function getReferrerStats(address referrer) external view returns (
        uint256 totalVolume,
        uint256 totalEarnings
    )
    ```

    *   **Purpose**: Retrieves key performance indicators for a specific referrer address.
    *   **Parameters**:
        *   `referrer`: The address of the referrer to query statistics for.
    *   **Return Values**:
        *   `totalVolume`: The total volume (in ETH equivalent, based on the value of fees generated) attributed to this referrer.
        *   `totalEarnings`: The total amount of fees (in ETH) earned and successfully distributed to this referrer.
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function fetchReferrerStats(referrerAddress) {
      try {
        // Ensure routerAbi includes getReferrerStats definition
        const stats = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getReferrerStats",
          args: [referrerAddress],
        });
        const [totalVolume, totalEarnings] = stats;

        console.log(`Stats for Referrer ${referrerAddress}:`);
        console.log(`  Total Volume (ETH equiv.): ${formatUnits(totalVolume, 18)}`);
        console.log(`  Total Earnings (ETH): ${formatUnits(totalEarnings, 18)}`);

      } catch (error) {
        console.error(`Failed to fetch stats for referrer ${referrerAddress}:`, error);
      }
    }
    // Example: fetchReferrerStats("0xReferrerAddress");
    // Ensure routerAbi includes: "function getReferrerStats(address referrer) external view returns (uint256 totalVolume, uint256 totalEarnings)"
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def fetch_referrer_stats(referrer_address):
        try:
            # Ensure ROUTER_ABI includes getReferrerStats definition
            stats = router_contract.functions.getReferrerStats(referrer_address).call()
            total_volume, total_earnings = stats

            print(f"Stats for Referrer {referrer_address}:")
            print(f"  Total Volume (ETH equiv.): {w3.from_wei(total_volume, 'ether')}")
            print(f"  Total Earnings (ETH): {w3.from_wei(total_earnings, 'ether')}")

        except Exception as e:
            print(f"An error occurred fetching stats for {referrer_address}: {e}")

    # Example: fetch_referrer_stats("0xReferrerAddress")
    # Ensure ROUTER_ABI includes: {"inputs":[{"internalType":"address","name":"referrer","type":"address"}],"name":"getReferrerStats","outputs":[{"internalType":"uint256","name":"totalVolume","type":"uint256"},{"internalType":"uint256","name":"totalEarnings","type":"uint256"}],"stateMutability":"view","type":"function"}
    ```

7.  **`getUserFirstReferrer`**

    ```solidity
    function getUserFirstReferrer(address user) external view returns (address)
    ```

    *   **Purpose**: Retrieves the address of the *first* referrer associated with a specific user address. This is recorded the first time a user performs a swap with a non-zero referrer.
    *   **Parameters**:
        *   `user`: The address of the user to query.
    *   **Return Values**:
        *   `address`: The address of the first referrer for the specified user. Returns the zero address (`address(0)`) if the user has never been referred or has only performed swaps without a referrer.
    *   **Side Effects**: None (view function).
    *   **Reverts**: None.
    *   **Access Control**: None (public view).

    **TypeScript Example (viem.sh)**

    ```typescript
    // Assuming setup

    async function fetchUserFirstReferrer(userAddress) {
      try {
        // Ensure routerAbi includes getUserFirstReferrer definition
        const firstReferrer = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: routerAbi,
          functionName: "getUserFirstReferrer",
          args: [userAddress],
        });
        console.log(`First referrer for user ${userAddress}: ${firstReferrer}`);
      } catch (error) {
        console.error(`Failed to fetch first referrer for user ${userAddress}:`, error);
      }
    }
    // Example: fetchUserFirstReferrer("0xUserAddress");
    // Ensure routerAbi includes: "function getUserFirstReferrer(address user) external view returns (address)"
    ```

    **Python Example (web3.py)**

    ```python
    # Assuming setup

    def fetch_user_first_referrer(user_address):
        try:
            # Ensure ROUTER_ABI includes getUserFirstReferrer definition
            first_referrer = router_contract.functions.getUserFirstReferrer(user_address).call()
            print(f"First referrer for user {user_address}: {first_referrer}")
        except Exception as e:
            print(f"An error occurred fetching first referrer for {user_address}: {e}")

    # Example: fetch_user_first_referrer("0xUserAddress")
    # Ensure ROUTER_ABI includes: {"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getUserFirstReferrer","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
    ```

## Integration Examples

### TypeScript Example (viem.sh)

```typescript
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ... (setup omitted for brevity)

const routerAbi = parseAbi([
  "function swapExactTokensForTokensV2(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 deadline, uint16 dynamicFeeBps, address referrer) external returns (uint256)",
  "function getExpectedOutputV2(address tokenIn, address tokenOut, uint256 amountIn, uint16 feeBps) external view returns (uint256, uint256)",
  "function getReferrerStats(address referrer) external view returns (uint256,uint256)",
  // ... other functions as needed
]);

// Example: Swap DAI for USDC with a referrer
async function swapDaiForUsdcV2WithReferral() {
  // ... (approval logic omitted)
  const referrer = "0xReferrerAddress"; // Use a valid referrer or address(0)
  const swapHash = await walletClient.writeContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: "swapExactTokensForTokensV2",
    args: [DAI, USDC, amountIn, amountOutMin, deadline, dynamicFeeBps, referrer],
  });
  // ... (wait for receipt, etc.)
}

// Example: Query referrer analytics
async function getReferrerStats(referrer) {
  const [totalVolume, totalEarnings] = await publicClient.readContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: "getReferrerStats",
    args: [referrer],
  });
  console.log({ totalVolume, totalEarnings });
}
```

### Python Example (web3.py)

```python
# ... (setup omitted for brevity)

# Example: Swap DAI for USDC with a referrer
def swap_dai_for_usdc_v2_with_referral():
    referrer = '0xReferrerAddress'  # Use a valid referrer or '0x000...0'
    swap_tx = router.functions.swapExactTokensForTokensV2(
        DAI, USDC, amount_in, amount_out_min, deadline, dynamic_fee_bps, referrer
    ).build_transaction({
        'from': account.address,
        'nonce': web3.eth.get_transaction_count(account.address),
        'gas': 300000,
        'gasPrice': web3.eth.gas_price
    })
    # ... (sign/send/wait for receipt)

# Example: Query referrer analytics
def get_referrer_stats(referrer):
    stats = router.functions.getReferrerStats(referrer).call()
    print(f"Total volume: {stats[0]}, Total earnings: {stats[1]}")
```

### Event Listening Examples

Listening to events emitted by the router is crucial for tracking swaps and fee distributions off-chain.

**TypeScript Example (viem.sh - Listening to `SwapExecuted`)**

```typescript
// Assuming setup: publicClient, ROUTER_ADDRESS, routerAbi

// Ensure routerAbi includes the SwapExecuted event definition
// "event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount, uint16 feeBps, uint8 protocolType, address referrer, uint256 timestamp)"

console.log("Watching for SwapExecuted events...");

const unwatch = publicClient.watchContractEvent({
  address: ROUTER_ADDRESS,
  abi: routerAbi,
  eventName: 'SwapExecuted',
  onLogs: logs => {
    logs.forEach(log => {
      const { user, tokenIn, tokenOut, amountIn, amountOut, feeAmount, feeBps, protocolType, referrer, timestamp } = log.args;
      console.log("--- SwapExecuted Event Received ---");
      console.log(`  User: ${user}`);
      console.log(`  Token In: ${tokenIn}`);
      console.log(`  Token Out: ${tokenOut}`);
      console.log(`  Amount In: ${formatUnits(amountIn ?? 0n, 18)}`); // Adjust decimals as needed
      console.log(`  Amount Out: ${formatUnits(amountOut ?? 0n, 6)}`); // Adjust decimals as needed
      console.log(`  Fee Amount (TokenIn): ${formatUnits(feeAmount ?? 0n, 18)}`); // Adjust decimals
      console.log(`  Fee Bps: ${feeBps}`);
      console.log(`  Protocol Type: ${protocolType}`); // 1=V2, 2=V3, 3=V3_Multi
      console.log(`  Referrer: ${referrer}`);
      console.log(`  Timestamp: ${new Date(Number(timestamp ?? 0n) * 1000).toISOString()}`);
      console.log(`  Tx Hash: ${log.transactionHash}`);
      console.log("---------------------------------");
    });
  },
  onError: error => {
    console.error("Error watching events:", error);
  }
});

// To stop watching later: unwatch();
```

**Python Example (web3.py - Listening to `SwapExecuted`)**

```python
# Assuming setup: w3, router_contract, ROUTER_ABI
# Requires web3.py with WebSocketProvider for real-time event filtering

# Ensure ROUTER_ABI includes the SwapExecuted event definition
# {"anonymous":false,"inputs":[...],"name":"SwapExecuted","type":"event"}

import asyncio
from web3 import Web3

async def log_loop(event_filter, poll_interval):
    print("Watching for SwapExecuted events...")
    while True:
        try:
            for event in event_filter.get_new_entries():
                handle_event(event)
            await asyncio.sleep(poll_interval)
        except Exception as e:
            print(f"Error in event loop: {e}")
            await asyncio.sleep(poll_interval) # Avoid tight loop on error

def handle_event(event):
    args = event['args']
    print("--- SwapExecuted Event Received ---")
    print(f"  User: {args['user']}")
    print(f"  Token In: {args['tokenIn']}")
    print(f"  Token Out: {args['tokenOut']}")
    # Adjust decimals based on tokenIn/tokenOut if known, otherwise display raw
    print(f"  Amount In (raw): {args['amountIn']}")
    print(f"  Amount Out (raw): {args['amountOut']}")
    print(f"  Fee Amount (raw): {args['feeAmount']}")
    print(f"  Fee Bps: {args['feeBps']}")
    print(f"  Protocol Type: {args['protocolType']}") # 1=V2, 2=V3, 3=V3_Multi
    print(f"  Referrer: {args['referrer']}")
    ts = args['timestamp']
    print(f"  Timestamp: {ts} ({time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(ts))})")
    print(f"  Tx Hash: {event['transactionHash'].hex()}")
    print("---------------------------------")

async def main():
    # Use WebSocketProvider for real-time listening
    # Replace with your WSS endpoint if different
    wss_url = RPC_URL.replace("https", "wss").replace("http", "ws")
    async_w3 = Web3(Web3.WebsocketProvider(wss_url))
    async_router_contract = async_w3.eth.contract(address=ROUTER_ADDRESS, abi=ROUTER_ABI)

    event_filter = async_router_contract.events.SwapExecuted.create_filter(fromBlock='latest')
    await log_loop(event_filter, 2) # Poll every 2 seconds

if __name__ == '__main__':
    # Note: Running asyncio might require specific setup depending on your environment
    # Example assumes Python 3.7+
    # loop = asyncio.get_event_loop()
    # try:
    #     loop.run_until_complete(main())
    # finally:
    #     loop.close()
    print("Run this example within an async context or adapt using threading for synchronous code.")

```

*(Similar examples can be adapted for other events like `FeeDistributed` or `SwapExecutedWithTax` by changing the event name and handling the specific arguments.)*

## Error Handling

| Error                      | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `ZeroAddressNotAllowed`    | Thrown when a zero address is used where not allowed      |
| `DeadlineExpired`          | Thrown if the deadline has passed                         |
| `InsufficientAmount`       | Thrown if input amount is zero or insufficient            |
| `FeeTooHigh`               | Thrown if fee exceeds maximum allowed                     |
| `InvalidPath`              | Thrown if swap path is invalid                            |
| `SlippageToleranceTooHigh` | Thrown if slippage tolerance exceeds maximum              |
| `NotContractItself`        | Thrown if internal-only function is called externally     |
| `InsufficientOutputAmount` | Thrown if output is less than minimum required            |
| `NotInEmergencyState`      | Thrown if emergency-only function is called outside state |
| `ETHTransferFailed`        | Thrown if ETH transfer fails                              |
| `PathTooShort`             | Thrown if swap path is too short                          |
| `FeesLengthMismatch`       | Thrown if fees array length mismatches tokens array       |
| `SelfReferralNotAllowed`   | Thrown if user refers themselves                          |
| `InvalidReferrerAddress`   | Thrown if referrer is contract itself                     |

## Events

| Event                           | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `SwapExecuted`                  | Emitted on standard swap execution                 |
| `SwapExecutedWithTax`           | Emitted on swap with tax tokens                    |
| `FeeUpdated`                    | Emitted when default fee is updated                |
| `FeesEnabledUpdated`            | Emitted when fees are enabled/disabled             |
| `FeeBeneficiaryUpdated`         | Emitted when fee beneficiary is updated            |
| `SlippageToleranceUpdated`      | Emitted when slippage tolerance is updated         |
| `TokenSlippageToleranceUpdated` | Emitted when token-specific slippage is updated    |
| `EmergencyStateChanged`         | Emitted when emergency state changes               |
| `EmergencyActivated`            | Emitted when emergency is activated                |
| `EmergencyRecoveryCompleted`    | Emitted when emergency is deactivated              |
| `EmergencyFundsRecovered`       | Emitted when funds are recovered in emergency      |
| `ReferralPercentageUpdated`     | Emitted when referral percentage is updated        |
| `ReferralPaymentFailed`         | Emitted when referral payment fails                |
| `FeeDistributed`                | Emitted when fees are distributed                  |
| `UserReferred`                  | Emitted when a user is referred for the first time |

## Best Practices

1. **Set a reasonable deadline** for swaps to avoid failed transactions.
2. **Handle slippage carefully**: set `amountOutMin` and slippage tolerances based on your risk.
3. **Referral usage**: Always use a valid referrer address (not your own or the contract itself) to participate in referral rewards.
4. **Tax tokens**: For tokens with transfer taxes, use `swapExactTokensForTokensV2WithTax` and set `taxAdjustment` appropriately.
5. **Approval management**: Check and set ERC20 allowances as needed before swaps.
6. **Gas optimization**: Multi-hop swaps and tax tokens may require higher gas limits.
7. **Emergency awareness**: If the contract is in emergency state, most functions are disabled except for recovery.
8. **Analytics**: Use analytics functions to monitor referral performance and fee distributions.
9. **Test thoroughly**: Always test on testnets before mainnet deployment.

## Security Considerations

1. **Frontrunning protection**: Use slippage and deadlines to mitigate MEV risks.
2. **Role management**: Only trusted parties should have admin or fee manager roles.
3. **Token approvals**: Prefer minimal approvals for security.
4. **Emergency controls**: Be aware that admins can activate emergency state and recover funds.
5. **Referral system**: Prevent self-referral and contract self-referral for integrity.
6. **External protocol risk**: The router interacts with Uniswap and ERC20 tokens; ensure you trust these contracts.

## Conclusion

The DeepWhalesRouter provides a powerful, extensible interface for executing token swaps with built-in fee collection, referral rewards, analytics, and robust emergency controls. By following this documentation and the provided examples, developers can safely and efficiently integrate with the DeepWhalesRouter in their applications.

## Fee Distribution Model

The DeepWhalesRouter implements an immediate fee distribution model with referral rewards:

1. **Immediate Distribution**: Fees are converted to ETH and distributed immediately after each swap, eliminating the need for periodic distribution or manual withdrawals.

2. **Referral Rewards**: A configurable percentage of collected fees (default 40%) is sent to the referrer, with the remainder going to the fee beneficiary.

3. **ETH-Based Fees**: All collected fees are converted to ETH before distribution, providing a consistent asset for both referrers and the beneficiary.

4. **Fee Conversion**: Input tokens are swapped to ETH using Uniswap V2 with configurable slippage tolerance.

5. **Conversion Fallbacks**: If fee conversion fails, the failure is recorded but doesn't prevent the main swap from completing.

6. **Distribution Records**: Each distribution is recorded with timestamp, amounts, and recipient details for analytical purposes.

The distribution flow works as follows:

1. User initiates a swap with a referrer address
2. Router collects a fee from the input tokens
3. Fee tokens are converted to ETH
4. ETH is split between referrer and beneficiary based on referral percentage
5. Fee distribution details are recorded
6. Referral statistics are updated

This model ensures prompt rewards for referrers, efficient treasury management, and comprehensive analytics.

## Referral System

The DeepWhalesRouter includes a robust referral system that tracks attribution, rewards referrers, and maintains detailed analytics:

1. **First Referrer Tracking**: The system records the first referrer for each user, ensuring consistent attribution.

2. **Referrer Validation**: The system prevents self-referrals and invalid referrers (e.g., referring the contract itself).

3. **Performance Analytics**: For each referrer, the system tracks:
   - Total volume referred (in ETH equivalent)
   - Total earnings received (in ETH)
   - First seen timestamp
   - Number of referred transactions

4. **Immediate Rewards**: Referrers receive their percentage of fees in ETH immediately after each swap.

5. **Fallback Handling**: If payment to a referrer fails, their portion is redirected to the fee beneficiary.

Integrators can use the referral system to build reward programs, tiered reward structures, or marketing campaigns by analyzing the on-chain data.

## Pausability Features

The DeepWhalesRouter implements a robust pause mechanism that allows authorized administrators to quickly halt swap operations in case of emergencies, suspicious activity, or during maintenance:

1. **Role-Based Access Control**: Only accounts with the `PAUSER_ROLE` can pause and unpause the contract. This role is granted to both the admin and emergency admin addresses during contract construction.

2. **Swap Protection**: The `swapAllowed` modifier is applied to all swap functions, preventing execution when the contract is paused or in emergency state.

3. **Detailed Reason Tracking**: When pausing the contract, admins can provide a reason string which is emitted in the `RouterPaused` event, allowing for clear communication of why operations were halted.

4. **Distinct Events**: The contract emits custom events for both pause (`RouterPaused`) and unpause (`RouterUnpaused`) operations, making it easier to track pause state changes.

5. **View Function**: An `isPaused()` function is provided for external services to easily check the current pause state.

The pause mechanism works independently from but alongside the emergency state system. While the emergency state is designed for more severe situations requiring fund recovery, the pause feature provides a lighter-weight circuit breaker that can be quickly toggled without affecting other contract functionality.

Example event emission:
```solidity
emit RouterPaused(msg.sender, "Suspicious trading volume detected");
```

The pause feature inherits from OpenZeppelin's `Pausable` contract, ensuring a well-tested implementation of this critical safety mechanism.