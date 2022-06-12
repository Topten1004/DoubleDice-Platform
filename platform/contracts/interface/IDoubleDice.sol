// SPDX-License-Identifier: Unlicensed
pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../library/FixedPointTypes.sol";

uint256 constant UNSPECIFIED_ZERO = 0;

/// @notice The version defines how to interpret the data.
/// In v1 the data could be abi-encoded, in v2 it could be JSON-encoded,
/// and in v3 the data could be just a sha256 hash of the content.
/// In v4 it could contain a server-signature.
/// It doesn't matter.
struct EncodedVirtualFloorMetadata {
    bytes32 version;
    bytes data;
}

struct VirtualFloorCreationParams {

    /// @notice Lower 5 bytes must be 0x00_00_00_00_00. Upper 27 bytes must be unique.
    /// Since all VF-related functions accept this id as an argument,
    /// it pays to choose an id with more zero-bytes, as these waste less intrinsic gas,
    /// and the savings will add up in the long run.
    /// Suggestion: This id could be of the form 0xVV_VV_VV_VV_00_00_00_00_00
    uint256 virtualFloorId;

    /// @notice Should be >= 1.0
    /// Should be scaled by 1e18
    UFixed256x18 betaOpen_e18;

    /// @notice Should be <= 1.0
    /// E.g. 2.5% is represented as 0.025, which is passed as 0_025000_000000_000000
    /// creationFee = creatorFee + platformFee
    /// ToDo: Name differently, because this is only charged if VF wins, not only if created
    UFixed256x18 creationFeeRate_e18;

    uint32 tOpen;
    uint32 tClose;
    uint32 tResolve;

    uint8 nOutcomes;
    IERC20Upgradeable paymentToken;

    uint256 bonusAmount;

    /// @notice Leave unspecified by passing value 0
    uint256 optionalMinCommitmentAmount;

    /// @notice Leave unspecified by passing value 0
    uint256 optionalMaxCommitmentAmount;

    EncodedVirtualFloorMetadata metadata;
}

struct CreatedVirtualFloorParams {
    UFixed256x18 betaOpen_e18;
    UFixed256x18 creationFeeRate_e18;
    UFixed256x18 platformFeeRate_e18;
    uint32 tOpen;
    uint32 tClose;
    uint32 tResolve;
    uint8 nOutcomes;
    IERC20Upgradeable paymentToken;
    uint256 bonusAmount;
    uint256 minCommitmentAmount;
    uint256 maxCommitmentAmount;
    address creator;
}

enum VirtualFloorState {
    None,
    Active_Open_MaybeResolvableNever,    // formerly Running
    Active_Open_ResolvableLater,         // formerly Running
    Active_Closed_ResolvableNever,       // formerly ClosedUnresolvable
    Active_Closed_ResolvableLater,       // formerly ClosedPreResolvable
    Active_Closed_ResolvableNow,         // formerly ClosedResolvable
    Claimable_Payouts,                   // formerly ResolvedWinners
    Claimable_Refunds_ResolvedNoWinners, // formerly CancelledResolvedNoWinners
    Claimable_Refunds_ResolvableNever,   // formerly CancelledUnresolvable
    Claimable_Refunds_Flagged            // formerly CancelledFlagged
}

enum VirtualFloorResolutionType {
    NoWinners,
    Winners
}

error UnauthorizedMsgSender();

error WrongVirtualFloorState(VirtualFloorState actualState);

error TooEarly();

error TooLate();

error DuplicateVirtualFloorId();

/// @notice platformFeeRate <= 1.0 not satisfied
error PlatformFeeRateTooLarge();

/// @notice Trying to create a VF with a non-whitelisted ERC-20 payment-token
error PaymentTokenNotWhitelisted();

/// @notice A VF id's lower 5 bytes must be 0x00_00_00_00_00
error InvalidVirtualFloorId();

/// @notice betaOpen >= 1.0 not satisfied
error BetaOpenTooSmall();

/// @notice creationFeeRate <= 1.0 not satisfied
error CreationFeeRateTooLarge();

/// @notice VF timeline does not satisfy relation tOpen < tClose <= tResolve
error InvalidTimeline();

/// @notice _MIN_POSSIBLE <= min <= max <= _MAX_POSSIBLE not satisfied
error InvalidMinMaxCommitmentAmounts();

/// @notice nOutcomes >= 2 not satisfied
error NotEnoughOutcomes();

/// @notice outcomeIndex < nOutcomes not satisfied
error OutcomeIndexOutOfRange();

/// @notice minCommitmentAmount <= amount <= maxCommitmentAmount not satisfied
error CommitmentAmountOutOfRange();

error CommitmentBalanceTransferWhilePaused();

error CommitmentBalanceTransferRejection(uint256 id, VirtualFloorState state);

/// @notice One of the token ids passed to a claim does not correspond to the passed virtualFloorId
error MismatchedVirtualFloorId(uint256 tokenId);

error ResolveWhilePaused();

error CommitmentDeadlineExpired();


interface IDoubleDice is
    IAccessControlUpgradeable,
    IERC1155MetadataURIUpgradeable
{
    event VirtualFloorCreation(
        uint256 indexed virtualFloorId,
        address indexed creator,
        UFixed256x18 betaOpen_e18,
        UFixed256x18 creationFeeRate_e18,
        UFixed256x18 platformFeeRate_e18,
        uint32 tOpen,
        uint32 tClose,
        uint32 tResolve,
        uint8 nOutcomes,
        IERC20Upgradeable paymentToken,
        uint256 bonusAmount,
        uint256 minCommitmentAmount,
        uint256 maxCommitmentAmount,
        EncodedVirtualFloorMetadata metadata
    );

    event UserCommitment(
        uint256 indexed virtualFloorId,
        address indexed committer,
        uint8 outcomeIndex,
        uint256 timeslot,
        uint256 amount,
        UFixed256x18 beta_e18,
        uint256 tokenId
    );

    event VirtualFloorCancellationFlagged(
        uint256 indexed virtualFloorId,
        string reason
    );

    event VirtualFloorCancellationUnresolvable(
        uint256 indexed virtualFloorId
    );

    event VirtualFloorResolution(
        uint256 indexed virtualFloorId,
        uint8 winningOutcomeIndex,
        VirtualFloorResolutionType resolutionType,
        uint256 winnerProfits,
        uint256 platformFeeAmount,
        uint256 creatorFeeAmount
    );


    function createVirtualFloor(VirtualFloorCreationParams calldata params) external;

    function commitToVirtualFloor(uint256 virtualFloorId, uint8 outcomeIndex, uint256 amount, uint256 deadline) external;

    function cancelVirtualFloorFlagged(uint256 virtualFloorId, string calldata reason) external;

    function cancelVirtualFloorUnresolvable(uint256 virtualFloorId) external;


    function claimRefunds(uint256 vfId, uint256[] calldata tokenIds) external;

    function claimPayouts(uint256 vfId, uint256[] calldata tokenIds) external;


    function platformFeeRate_e18() external view returns (UFixed256x18);

    function platformFeeBeneficiary() external view returns (address);

    function getVirtualFloorCreator(uint256 virtualFloorId) external view returns (address);

    function getVirtualFloorParams(uint256 virtualFloorId) external view returns (CreatedVirtualFloorParams memory);

    function getVirtualFloorState(uint256 virtualFloorId) external view returns (VirtualFloorState);


    function isPaymentTokenWhitelisted(IERC20Upgradeable token) external view returns (bool);


    // ---------- Admin functions ----------

    event PlatformFeeBeneficiaryUpdate(address platformFeeBeneficiary);

    function setPlatformFeeBeneficiary(address platformFeeBeneficiary) external;

    event PlatformFeeRateUpdate(UFixed256x18 platformFeeRate_e18);

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18) external;

    event ContractURIUpdate(string contractURI);

    function setContractURI(string memory contractURI) external;

    event PaymentTokenWhitelistUpdate(IERC20Upgradeable indexed token, bool whitelisted);

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external;
}
