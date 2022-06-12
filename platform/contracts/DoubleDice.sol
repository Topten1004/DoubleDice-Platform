// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./ChallengeableCreatorOracle.sol";
import "./CreationQuotas.sol";
import "./VirtualFloorMetadataValidator.sol";

contract DoubleDice is
    ChallengeableCreatorOracle,
    CreationQuotas,
    VirtualFloorMetadataValidator
{

    function initialize(
        BaseDoubleDiceInitParams calldata params,
        IERC20MetadataUpgradeable bondUsdErc20Token_
    )
        external
        initializer
        multipleInheritanceLeafInitializer
    {
        __ChallengeableCreatorOracle_init(params, bondUsdErc20Token_);
        __VirtualFloorMetadataValidator_init(params);
        __CreationQuotas_init(params);
    }

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params)
        internal override(BaseDoubleDice, VirtualFloorMetadataValidator, CreationQuotas)
    {
        CreationQuotas._onVirtualFloorCreation(params);
        VirtualFloorMetadataValidator._onVirtualFloorCreation(params);
    }

    function _onVirtualFloorConclusion(uint256 vfId)
        internal override(BaseDoubleDice, ChallengeableCreatorOracle, CreationQuotas)
    {
        ChallengeableCreatorOracle._onVirtualFloorConclusion(vfId);
        CreationQuotas._onVirtualFloorConclusion(vfId);
    }

}
