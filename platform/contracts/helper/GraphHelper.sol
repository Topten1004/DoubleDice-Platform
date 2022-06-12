// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "../VirtualFloorMetadataValidator.sol";

/// @dev The purpose of this contract is to assist the Graph indexer in abi-decoding an abi-encoded VirtualFloorMetadataV1 structure.
/// In theory the Graph should be able to abi-decode such a structure via the AssemblyScript function
/// [ethereum.decode](https://thegraph.com/docs/en/developer/assemblyscript-api/#encoding-decoding-abi).
/// However this function doesn't seem to handle tuple-arrays correctly,
/// so as the Graph indexer has the ability to call a deployed contract,
/// we work around the limitation by deploying this helper contract which
/// is then used by the Graph to decode metadata.
contract GraphHelper {

    /// @dev This function never needs to be called on the contract, and its sole purpose is to coerce TypeChain
    /// into generating a corresponding encodeFunctionData, which can be used to abi-encode a VirtualFloorMetadataV1
    /// without ever communicating with the deployed contract.
    /// Nevertheless:
    /// 1. Rather than on a separate interface, for simplicity it is included on this contract (and unnecessarily deployed)
    /// 2. Although it would have sufficed to have an empty implementation, we choose to include it
    function encodeVirtualFloorMetadataV1(VirtualFloorMetadataV1 calldata decoded) external pure returns (bytes memory encoded) {
        encoded = abi.encode(decoded);
    }

    function decodeVirtualFloorMetadataV1(bytes calldata encoded) external pure returns (VirtualFloorMetadataV1 memory decoded) {
        (decoded) = abi.decode(encoded, (VirtualFloorMetadataV1));
    }

}
