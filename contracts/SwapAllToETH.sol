// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

interface IWETH {
    function withdraw(uint256) external;
    function deposit() external payable;
}

contract SwapAllToETH is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Custom errors for gas optimization
    error InvalidRouter();
    error InvalidWETH();
    error NoTokensProvided();
    error SlippageTooHigh();
    error InvalidToken();
    error InvalidRecipient();
    error InvalidAmount();
    error ETHTransferFailed();

    IUniswapV2Router02 public immutable uniswapRouter;
    address public immutable WETH;

    event TokenSwapped(
        address indexed user,
        address indexed token,
        uint256 amountIn,
        uint256 amountOut
    );
    event TokenSwapFailed(address indexed user, address indexed token);
    event RecoveredERC20(address indexed token, uint256 amount, address indexed to);
    event RecoveredETH(uint256 amount, address indexed to);

    constructor(address _router, address _weth) {
        if (_router == address(0)) revert InvalidRouter();
        if (_weth == address(0)) revert InvalidWETH();
        uniswapRouter = IUniswapV2Router02(_router);
        WETH = _weth;
    }

    /// @notice Swap all listed tokens held by msg.sender into ETH, skipping any that fail
    function swapAllTokensToETH(
        address[] calldata tokens,
        uint256 slippageBps
    ) external nonReentrant {
        if (tokens.length == 0) revert NoTokensProvided();
        if (slippageBps > 10_000) revert SlippageTooHigh();

        for (uint256 i = 0; i < tokens.length; i++) {
            address tokenAddr = tokens[i];

            // 1) Handle WETH specially: user's WETH → ETH
            if (tokenAddr == WETH) {
                uint256 userWeth = IERC20(WETH).balanceOf(msg.sender);
                if (userWeth == 0) continue;

                // pull in WETH
                IERC20(WETH).safeTransferFrom(msg.sender, address(this), userWeth);
                // unwrap
                IWETH(WETH).withdraw(userWeth);
                // send ETH
                (bool sent,) = msg.sender.call{value: userWeth}("");
                if (!sent) {
                    // if send fails, wrap back into WETH and refund
                    IWETH(WETH).deposit{value: userWeth}();
                    IERC20(WETH).safeTransfer(msg.sender, userWeth);
                    emit TokenSwapFailed(msg.sender, WETH);
                } else {
                    emit TokenSwapped(msg.sender, WETH, userWeth, userWeth);
                }
                continue;
            }

            IERC20 token = IERC20(tokenAddr);
            uint256 userBal = token.balanceOf(msg.sender);
            if (userBal == 0) continue;

            // 2) pull tokens in
            uint256 beforeBal = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), userBal);
            uint256 received = token.balanceOf(address(this)) - beforeBal;
            if (received == 0) {
                emit TokenSwapFailed(msg.sender, tokenAddr);
                continue;
            }

            // 3) approve router
            token.safeApprove(address(uniswapRouter), 0);
            token.safeApprove(address(uniswapRouter), received);

            // 4) quote
            address[] memory path = new address[](2);
            path[0] = tokenAddr;
            path[1] = WETH;

            uint256[] memory quote;
            try uniswapRouter.getAmountsOut(received, path) returns (uint256[] memory q) {
                quote = q;
            } catch {
                // refund tokens on quote failure
                token.safeTransfer(msg.sender, received);
                emit TokenSwapFailed(msg.sender, tokenAddr);
                continue;
            }
            if (quote.length < 2) {
                token.safeTransfer(msg.sender, received);
                emit TokenSwapFailed(msg.sender, tokenAddr);
                continue;
            }

            uint256 amountOut = quote[1];
            uint256 minOut = (amountOut * (10_000 - slippageBps)) / 10_000;
            if (minOut == 0) {
                token.safeTransfer(msg.sender, received);
                emit TokenSwapFailed(msg.sender, tokenAddr);
                continue;
            }

            // 5) swap into this contract
            uint256 ethBefore = address(this).balance;
            bool swapOK;
            try uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
                received,
                minOut,
                path,
                address(this),
                block.timestamp + 300
            ) {
                swapOK = true;
            } catch {
                swapOK = false;
            }

            if (!swapOK) {
                // refund tokens if swap fails
                token.safeTransfer(msg.sender, received);
                emit TokenSwapFailed(msg.sender, tokenAddr);
                continue;
            }

            // 6) forward ETH
            uint256 ethReceived = address(this).balance - ethBefore;
            
            if (ethReceived < minOut) {
                emit TokenSwapFailed(msg.sender, tokenAddr);
                continue;
            }
            
            (bool ok,) = msg.sender.call{value: ethReceived}("");
            if (!ok) {
                emit TokenSwapFailed(msg.sender, tokenAddr);
                // ETH remains in contract - can be recovered by owner
                continue;
            }
            
            emit TokenSwapped(msg.sender, tokenAddr, received, ethReceived);
        }
    }

    /// @notice Recover any ERC-20 mistakenly left in the contract
    function recoverERC20(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        if (token == address(0)) revert InvalidToken();
        if (to == address(0)) revert InvalidRecipient();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (amount == 0 || amount > bal) revert InvalidAmount();
        IERC20(token).safeTransfer(to, amount);
        emit RecoveredERC20(token, amount, to);
    }

    /// @notice Recover any ETH mistakenly left in the contract
    function recoverETH(uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0 || address(this).balance < amount) revert InvalidAmount();
        (bool sent,) = to.call{value: amount}("");
        if (!sent) revert ETHTransferFailed();
        emit RecoveredETH(amount, to);
    }

    /// @notice Recover both ETH and ERC20 tokens in a single transaction
    function recoverBoth(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256 ethAmount,
        address to
    ) external onlyOwner {
        if (to == address(0)) revert InvalidRecipient();
        if (tokens.length != amounts.length) revert InvalidAmount();
        
        // Recover ERC20 tokens
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) revert InvalidToken();
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (amounts[i] == 0 || amounts[i] > bal) revert InvalidAmount();
            IERC20(tokens[i]).safeTransfer(to, amounts[i]);
            emit RecoveredERC20(tokens[i], amounts[i], to);
        }
        
        // Recover ETH
        if (ethAmount > 0) {
            if (address(this).balance < ethAmount) revert InvalidAmount();
            (bool sent,) = to.call{value: ethAmount}("");
            if (!sent) revert ETHTransferFailed();
            emit RecoveredETH(ethAmount, to);
        }
    }

    /// @notice Needed to receive ETH from Uniswap
    receive() external payable {}
} 