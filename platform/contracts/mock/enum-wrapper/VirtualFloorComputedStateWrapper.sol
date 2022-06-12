// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../../interface/IDoubleDice.sol";

contract VirtualFloorStateWrapper {
    VirtualFloorState constant public None = VirtualFloorState.None;
    VirtualFloorState constant public Active_Open_MaybeResolvableNever = VirtualFloorState.Active_Open_MaybeResolvableNever;
    VirtualFloorState constant public Active_Open_ResolvableLater = VirtualFloorState.Active_Open_ResolvableLater;
    VirtualFloorState constant public Active_Closed_ResolvableNever = VirtualFloorState.Active_Closed_ResolvableNever;
    VirtualFloorState constant public Active_Closed_ResolvableLater = VirtualFloorState.Active_Closed_ResolvableLater;
    VirtualFloorState constant public Active_Closed_ResolvableNow = VirtualFloorState.Active_Closed_ResolvableNow;
    VirtualFloorState constant public Claimable_Payouts = VirtualFloorState.Claimable_Payouts;
    VirtualFloorState constant public Claimable_Refunds_ResolvedNoWinners = VirtualFloorState.Claimable_Refunds_ResolvedNoWinners;
    VirtualFloorState constant public Claimable_Refunds_ResolvableNever = VirtualFloorState.Claimable_Refunds_ResolvableNever;
    VirtualFloorState constant public Claimable_Refunds_Flagged = VirtualFloorState.Claimable_Refunds_Flagged;
}
