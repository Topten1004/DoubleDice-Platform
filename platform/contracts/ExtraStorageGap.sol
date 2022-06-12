// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

contract ExtraStorageGap {

    /// @dev Reserve an extra gap, in case we want to extend a new (e.g.) OpenZeppelin base contract
    /// See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[200] private __gap;

}
