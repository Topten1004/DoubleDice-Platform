// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

error TooLargeForUint192(uint256 value);

library Utils {

    function toUint192(uint256 value) internal pure returns (uint192) {
        if (!(value <= type(uint192).max)) revert TooLargeForUint192(value);
        return uint192(value);
    }

    function isEmpty(string memory value) internal pure returns (bool) {
        return bytes(value).length == 0;
    }

    function add(uint256 a, int256 b) internal pure returns (uint256) {
        if (b >= 0) {
            return a + uint256(b);
        } else {
            return a - uint256(-b);
        }
    }

}
