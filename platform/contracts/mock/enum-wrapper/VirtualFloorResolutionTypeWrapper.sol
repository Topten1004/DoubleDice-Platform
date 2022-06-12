// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../interface/IDoubleDice.sol";

contract VirtualFloorResolutionTypeWrapper {
    VirtualFloorResolutionType constant public NoWinners = VirtualFloorResolutionType.NoWinners;
    VirtualFloorResolutionType constant public Winners = VirtualFloorResolutionType.Winners;
}
