// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";
import "./library/Utils.sol";

error CreationQuotaExceeded();

/// @dev Gas-naive implementation
contract CreationQuotas is BaseDoubleDice {

    using Utils for uint256;

    function __CreationQuotas_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    mapping(address => uint256) public creationQuotas;

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal override virtual {
        address creator = getVirtualFloorCreator(params.virtualFloorId);
        if (creationQuotas[creator] == 0) revert CreationQuotaExceeded();
        unchecked {
            creationQuotas[creator] -= 1;
        }
    }

    function _onVirtualFloorConclusion(uint256 vfId) internal override virtual {
        address creator = getVirtualFloorCreator(vfId);
        creationQuotas[creator] += 1;
    }

    struct QuotaAdjustment {
        address creator;
        int256 relativeAmount;
    }

    event CreationQuotaAdjustments(QuotaAdjustment[] adjustments);

    function adjustCreationQuotas(QuotaAdjustment[] calldata adjustments)
        external
        onlyRole(OPERATOR_ROLE)
    {
        for (uint256 i = 0; i < adjustments.length; i++) {
            QuotaAdjustment calldata adjustment = adjustments[i];
            creationQuotas[adjustment.creator] = creationQuotas[adjustment.creator].add(adjustment.relativeAmount);
        }
        emit CreationQuotaAdjustments(adjustments);
    }

    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;

}
