// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../BaseDoubleDice.sol";
import "../interface/IDoubleDice.sol";
import "./ERC1155TokenIds.sol";
import "./FixedPointTypes.sol";

// An estimate of how much the block.timestamp could possibly deviate
// from the real timestamp, and still be accepted by the network.
uint256 constant _MAX_POSSIBLE_BLOCK_TIMESTAMP_DISCREPANCY = 60 seconds;

// CR-01: If a buffer between tClose and tResolve were not to be enforced,
// it would then be possible to create a VF with tClose == tResolve,
// and a malicious miner could perform the following attack:
// At tUniversal = tResolve,
// when the winning outcome of the VF becomes known to the public,
// the miner would manipulate block.timestamp by a few seconds
// e.g. the miner would set block.timestamp = tUniversal - a few seconds,
// and the network would accept this block.
// But despite the VF result being known in the outside world,
// from the contract's point of view, it is still block.timestamp <= tClose,
// and the miner would take advantage of this to commit an amount of money
// to the outcome that in the outside world is known to be the winner.
//
// By enforcing a buffer between tClose and tResolve,
// i.e. by forcing (tResolve - tClose) to be considerably larger than the largest amount of time
// by which block.timestamp could possibly be manipulated, such an attack is averted.
uint256 constant _MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE = 10 * _MAX_POSSIBLE_BLOCK_TIMESTAMP_DISCREPANCY;

library VirtualFloorCreationParamsUtils {

    using ERC1155TokenIds for uint256;
    using FixedPointTypes for UFixed256x18;

    function validatePure(VirtualFloorCreationParams calldata $) internal pure {
        {
            if (!$.virtualFloorId.isValidVirtualFloorId()) revert InvalidVirtualFloorId();
        }
        {
            if (!($.betaOpen_e18.gte(_BETA_CLOSE))) revert BetaOpenTooSmall();
        }
        {
            if (!($.creationFeeRate_e18.lte(UFIXED256X18_ONE))) revert CreationFeeRateTooLarge();
        }
        {
            if (!($.tOpen < $.tClose && $.tClose + _MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE <= $.tResolve)) revert InvalidTimeline();
        }
        {
            if (!($.nOutcomes >= 2)) revert NotEnoughOutcomes();
        }
    }

    // Allow creation to happen up to 10% into the Open period,
    // to be a bit tolerant to mining delays.
    function tCreateMax(VirtualFloorCreationParams calldata params) internal pure returns (uint256) {
        return params.tOpen + (params.tClose - params.tOpen) / 10;
    }
}
