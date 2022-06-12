// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "./BaseDoubleDice.sol";
import "./library/Utils.sol";

struct VirtualFloorMetadataOpponent {
    string title;
    string image;
}

struct VirtualFloorMetadataOutcome {
    string title;
}

struct VirtualFloorMetadataResultSource {
    string title;
    string url;
}

struct VirtualFloorMetadataV1 {
    string category;
    string subcategory;
    string title;
    string description;
    bool isListed;
    VirtualFloorMetadataOpponent[] opponents;
    VirtualFloorMetadataOutcome[] outcomes;
    VirtualFloorMetadataResultSource[] resultSources;
    string discordChannelId;
    bytes extraData;
}


error InvalidMetadataVersion();

error MetadataOpponentArrayLengthMismatch();

error ResultSourcesArrayLengthMismatch();

error InvalidOutcomesArrayLength();

error TooFewOpponents();

error TooFewResultSources();

error EmptyCategory();

error EmptySubcategory();

error EmptyTitle();

error EmptyDescription();

error EmptyDiscordChannelId();


contract VirtualFloorMetadataValidator is BaseDoubleDice {

    using Utils for string;

    function __VirtualFloorMetadataValidator_init(BaseDoubleDiceInitParams calldata params) internal onlyInitializing {
        __BaseDoubleDice_init(params);
    }

    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal virtual override {
        uint256 version = uint256(params.metadata.version);
        if (!(version == 1)) revert InvalidMetadataVersion();

        (VirtualFloorMetadataV1 memory metadata) = abi.decode(params.metadata.data, (VirtualFloorMetadataV1));

        // `nOutcomes` could simply be taken to be `metadata.outcomes.length` and this `require` could then be dropped.
        // But for now we choose to make a clear distinction between "essential" data (that needs to be stored on-chain)
        // and "non-essential" data (data that we want to commit to and that is required in the frontend,
        // but that is is not essential for the operation of the smart-contract).
        // To this end, we group all non-essential data in the `metadata` parameter,
        // we require a separate `nOutcomes` "essential" argument to be passed,
        // and we enforce consistency with this check.
        if (!(metadata.outcomes.length == params.nOutcomes)) revert InvalidOutcomesArrayLength();

        if (!(metadata.opponents.length >= 1)) revert TooFewOpponents();

        if (!(metadata.resultSources.length >= 1)) revert TooFewResultSources();

        if (!(!metadata.category.isEmpty())) revert EmptyCategory();

        if (!(!metadata.subcategory.isEmpty())) revert EmptySubcategory();

        if (!(!metadata.title.isEmpty())) revert EmptyTitle();

        if (!(!metadata.description.isEmpty())) revert EmptyDescription();

        if (!(!metadata.discordChannelId.isEmpty())) revert EmptyDiscordChannelId();
    }

    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
