// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./DummyERC20.sol";

// solhint-disable-next-line no-empty-blocks
contract DummyUSDCoin is DummyERC20("USD Coin (Dummy)", "USDC", 6) {
}
