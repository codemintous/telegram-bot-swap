// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniswapV2Router {
    uint256 private mockAmountOut;
    uint256 private mockETHAmount;
    
    function setAmountOut(uint256 _amountOut) external {
        mockAmountOut = _amountOut;
    }
    
    function setMockETHAmount(uint256 _ethAmount) external {
        mockETHAmount = _ethAmount;
    }
    
    function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) {
            amounts[i] = mockAmountOut;
        }
        return amounts;
    }
    
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        require(deadline >= block.timestamp, "MockRouter: EXPIRED");
        require(amountOutMin <= mockAmountOut, "MockRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        
        // Transfer tokens from sender to this contract
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // Send ETH to recipient
        (bool success, ) = to.call{value: mockETHAmount}("");
        require(success, "MockRouter: ETH_TRANSFER_FAILED");
    }
    
    receive() external payable {}
} 