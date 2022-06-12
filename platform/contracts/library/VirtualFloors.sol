// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../BaseDoubleDice.sol";
import "../interface/IDoubleDice.sol";
import "./FixedPointTypes.sol";

uint256 constant _MIN_POSSIBLE_COMMITMENT_AMOUNT = 1;
uint256 constant _MAX_POSSIBLE_COMMITMENT_AMOUNT = type(uint256).max;

library VirtualFloors {

    using FixedPointTypes for UFixed256x18;
    using FixedPointTypes for UFixed32x6;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using VirtualFloors for VirtualFloor;

    function state(VirtualFloor storage vf) internal view returns (VirtualFloorState) {
        VirtualFloorInternalState _internalState = vf._internalState;
        if (_internalState == VirtualFloorInternalState.None) {
            return VirtualFloorState.None;
        } else if (_internalState == VirtualFloorInternalState.Active) {
            if (block.timestamp < vf.tClose) {
                if (vf.nonzeroOutcomeCount >= 2) {
                    return VirtualFloorState.Active_Open_ResolvableLater;
                } else {
                    return VirtualFloorState.Active_Open_MaybeResolvableNever;
                }
            } else {
                if (vf.nonzeroOutcomeCount >= 2) {
                    if (block.timestamp < vf.tResolve) {
                        return VirtualFloorState.Active_Closed_ResolvableLater;
                    } else {
                        return VirtualFloorState.Active_Closed_ResolvableNow;
                    }
                } else {
                    return VirtualFloorState.Active_Closed_ResolvableNever;
                }
            }
        } else if (_internalState == VirtualFloorInternalState.Claimable_Payouts) {
            return VirtualFloorState.Claimable_Payouts;
        } else if (_internalState == VirtualFloorInternalState.Claimable_Refunds_ResolvedNoWinners) {
            return VirtualFloorState.Claimable_Refunds_ResolvedNoWinners;
        } else if (_internalState == VirtualFloorInternalState.Claimable_Refunds_ResolvableNever) {
            return VirtualFloorState.Claimable_Refunds_ResolvableNever;
        } else /*if (_internalState == VirtualFloorInternalState.Claimable_Refunds_Flagged)*/ {
            assert(_internalState == VirtualFloorInternalState.Claimable_Refunds_Flagged); // Ensure all enum values have been handled.
            return VirtualFloorState.Claimable_Refunds_Flagged;
        }
    }

    /// @dev Compare:
    /// 1. (((tClose - t) * (betaOpen - 1)) / (tClose - tOpen)) * amount
    /// 2. (((tClose - t) * (betaOpen - 1) * amount) / (tClose - tOpen))
    /// (2) has less rounding error than (1), but then the *precise* effective beta used in the computation might not
    /// have a uint256 representation.
    /// Therefore we sacrifice some (miniscule) rounding error to gain computation reproducibility.
    function betaOf(VirtualFloor storage vf, uint256 t) internal view returns (UFixed256x18) {
        UFixed256x18 betaOpenMinusBetaClose = vf.betaOpenMinusBetaClose.toUFixed256x18();
        return _BETA_CLOSE.add(betaOpenMinusBetaClose.mul0(vf.tClose - t).div0(vf.tClose - vf.tOpen));
    }

    function totalCommitmentsToAllOutcomesPlusBonus(VirtualFloor storage vf) internal view returns (uint256 total) {
        total = vf.bonusAmount;
        for (uint256 i = 0; i < vf.nOutcomes; i++) {
            total += vf.outcomeTotals[i].amount;
        }
    }

    function minMaxCommitmentAmounts(VirtualFloor storage vf) internal view returns (uint256 min, uint256 max) {
        min = vf._optionalMinCommitmentAmount;
        max = vf._optionalMaxCommitmentAmount;
        if (min == UNSPECIFIED_ZERO) {
            min = _MIN_POSSIBLE_COMMITMENT_AMOUNT;
        }
        if (max == UNSPECIFIED_ZERO) {
            max = _MAX_POSSIBLE_COMMITMENT_AMOUNT;
        }
    }

    /// @dev Equivalent to state == Active_Open_ResolvableLater || state == Active_Open_MaybeResolvableNever,
    /// but ~300 gas cheaper.
    function isOpen(VirtualFloor storage vf) internal view returns (bool) {
        return vf._internalState == VirtualFloorInternalState.Active && block.timestamp < vf.tClose;
    }

    function isClaimableRefunds(VirtualFloor storage vf) internal view returns (bool) {
        return vf._internalState == VirtualFloorInternalState.Claimable_Refunds_ResolvedNoWinners
            || vf._internalState == VirtualFloorInternalState.Claimable_Refunds_ResolvableNever
            || vf._internalState == VirtualFloorInternalState.Claimable_Refunds_Flagged;
    }

    function refundBonusAmount(VirtualFloor storage vf) internal {
        if (vf.bonusAmount > 0) {
            vf.paymentToken.safeTransfer(vf.creator, vf.bonusAmount);
        }
    }

}
