// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../library/FixedPointTypes.sol";

contract FixedPointTypesMock {

    using FixedPointTypes for uint256;
    using FixedPointTypes for UFixed16x4;
    using FixedPointTypes for UFixed32x6;
    using FixedPointTypes for UFixed256x18;

    function add(UFixed256x18 a, UFixed256x18 b) external pure returns (UFixed256x18) {
        return a.add(b);
    }

    function sub(UFixed256x18 a, UFixed256x18 b) external pure returns (UFixed256x18) {
        return a.sub(b);
    }

    function mul0(UFixed256x18 a, uint256 b) external pure returns (UFixed256x18) {
        return a.mul0(b);
    }

    function div0(UFixed256x18 a, uint256 b) external pure returns (UFixed256x18) {
        return a.div0(b);
    }

    function divToUint256(UFixed256x18 a, UFixed256x18 b) external pure returns (uint256) {
        return a.divToUint256(b);
    }

    function floorToUint256(UFixed256x18 value) external pure returns (uint256) {
        return value.floorToUint256();
    }

    function eq(UFixed256x18 a, UFixed256x18 b) external pure returns (bool) {
        return a.eq(b);
    }

    function gte(UFixed256x18 a, UFixed256x18 b) external pure returns (bool) {
        return a.gte(b);
    }

    function lte(UFixed256x18 a, UFixed256x18 b) external pure returns (bool) {
        return a.lte(b);
    }

    function toUFixed16x4(UFixed256x18 value) external pure returns (UFixed16x4 converted) {
        return value.toUFixed16x4();
    }

    function toUFixed32x6(UFixed256x18 value) external pure returns (UFixed32x6 converted) {
        return value.toUFixed32x6();
    }

    function toUFixed256x18__fromUint256(uint256 value) external pure returns (UFixed256x18) {
        return value.toUFixed256x18();
    }

    function toUFixed256x18__fromUFixed16x4(UFixed16x4 value) external pure returns (UFixed256x18 converted) {
        return value.toUFixed256x18();
    }

    function toUFixed256x18__fromUFixed32x6(UFixed32x6 value) external pure returns (UFixed256x18 converted) {
        return value.toUFixed256x18();
    }

}
