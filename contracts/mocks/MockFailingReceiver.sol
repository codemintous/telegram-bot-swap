// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockFailingReceiver {
    // This contract will fail to receive ETH
    // It doesn't have a receive() or fallback() function
    
    // Any ETH sent to this contract will cause the transaction to revert
    // This is useful for testing ETH transfer failure scenarios
    
    function doSomething() external pure returns (bool) {
        return true;
    }
} 