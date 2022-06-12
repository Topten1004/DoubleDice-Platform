// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

contract MultipleInheritanceOptimization {

    bool private _rootInitialized;

    modifier multipleInheritanceRootInitializer() {
        if (!_rootInitialized) {
            _rootInitialized = true;
            _;
        }
    }

    modifier multipleInheritanceLeafInitializer() {
        _;
        _rootInitialized = false;
    }

    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
