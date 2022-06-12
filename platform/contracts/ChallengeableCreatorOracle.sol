// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./BaseDoubleDice.sol";

enum ResultUpdateAction {
    AdminFinalizedUnsetResult,
    CreatorSetResult,
    SomeoneConfirmedUnchallengedResult,
    SomeoneChallengedSetResult,
    AdminFinalizedChallenge
}

enum ResolutionState {
    None,
    Set,
    Challenged,
    ChallengeCancelled,
    Complete
}

struct Resolution {
    ResolutionState state;
    uint8 setOutcomeIndex;
    uint32 tResultChallengeMax;
    uint8 challengeOutcomeIndex;
    address challenger;
}


error WrongResolutionState(ResolutionState state);

error ChallengeOutcomeIndexEqualToSet();


/**
 * @notice This Resolver allows the VF-owner to set the result within 1 hour of tResolve:
 * - If VF-owner does not set it within 1 hour of tResolve, platform-admin may resolve VF via finalizeUnsetResult
 * - If VF-owner sets it within 1 hour of tResolve, say at tSet, then a second 1-hour timer starts counting down:
 *   - If within 1 hour of tSet the VF-owner's result is not challenged by anyone, then after tSet + 1 hour,
 *     *anyone* may `confirmUnchallengedResult`, which will resolve the underlying VF
 *   - If within 1 hour of tSet a challenger challenges the VF-owner's result, then the platform-admin will have to
 *     look into the VF and `finalizeChallenge`.
 */ 
contract ChallengeableCreatorOracle is BaseDoubleDice {

    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;
    using SafeCastUpgradeable for uint256;

    uint256 constant public CHALLENGE_BOND_USD_AMOUNT = 100;

    uint256 constant public SET_WINDOW_DURATION = 1 hours;

    uint256 constant public CHALLENGE_WINDOW_DURATION = 1 hours;

    /// @dev These variables could be immutable,
    /// but for now we write them to storage to keep things uniform.
    IERC20MetadataUpgradeable private _bondUsdErc20Token;

    function bondUsdErc20Token() public view returns (IERC20MetadataUpgradeable) {
        return _bondUsdErc20Token;
    }

    function _bondAmount() private view returns (uint256) {
        return CHALLENGE_BOND_USD_AMOUNT * (10 ** _bondUsdErc20Token.decimals());
    }

    mapping(uint256 => Resolution) public resolutions;

    function __ChallengeableCreatorOracle_init(
        BaseDoubleDiceInitParams calldata baseParams,
        IERC20MetadataUpgradeable bondUsdErc20Token_
    )
        internal
        onlyInitializing
    {
        __BaseDoubleDice_init(baseParams);
        _bondUsdErc20Token = bondUsdErc20Token_;
    }

    event ResultUpdate(
        uint256 indexed vfId,
        address operator,
        ResultUpdateAction action,
        uint8 outcomeIndex
    );

    /// @notice Can be called by platform-admin on a VF whose owner did not set result
    /// within SET_WINDOW_DURATION from VF's tResolve.
    /// @dev We do not impose any requirements on finalOutcomeIndex because if it out-of-range,
    /// or check whether underlying VF is in the ClosedResolvable state,
    /// as underlying platform.resolve call will fail anyway if conditions are not correct.
    function finalizeUnsetResult(uint256 vfId, uint8 finalOutcomeIndex)
        external
        onlyRole(OPERATOR_ROLE)
    {
        Resolution storage resolution = resolutions[vfId];
        if (!(resolution.state == ResolutionState.None)) revert WrongResolutionState(resolution.state);
        CreatedVirtualFloorParams memory vfParams = getVirtualFloorParams(vfId);
        uint256 tResultSetMax = vfParams.tResolve + SET_WINDOW_DURATION;

        // CR-01: If block.timestamp is just a few seconds past tResultSetMax,
        // manipulating block.timestamp by a few seconds to be <= tResultSetMax
        // will cause this transaction to fail.
        // If that were to happen, this transaction could simply be reattempted later.
        // solhint-disable-next-line not-rely-on-time
        if (!(block.timestamp > tResultSetMax)) revert TooEarly();

        resolution.state = ResolutionState.Complete;
        emit ResultUpdate(vfId, _msgSender(), ResultUpdateAction.AdminFinalizedUnsetResult, finalOutcomeIndex);

        // nonReentrant
        // Since finalizeUnsetResult is guarded by require(state == None)
        // and state has now been moved to Complete,
        // any external calls made by _resolve cannot re-enter finalizeUnsetResult.
        _resolve(vfId, finalOutcomeIndex, platformFeeBeneficiary());
    }

    function setResult(uint256 vfId, uint8 setOutcomeIndex)
        external
        whenNotPaused
    {
        VirtualFloorState state = getVirtualFloorState(vfId);
        if (!(state == VirtualFloorState.Active_Closed_ResolvableNow)) revert WrongVirtualFloorState(state);
        CreatedVirtualFloorParams memory vfParams = getVirtualFloorParams(vfId);
        if (!(_msgSender() == vfParams.creator)) revert UnauthorizedMsgSender();
        Resolution storage resolution = resolutions[vfId];
        if (!(resolution.state == ResolutionState.None)) revert WrongResolutionState(resolution.state);
        uint256 tResultSetMax = vfParams.tResolve + SET_WINDOW_DURATION;

        // CR-01: If block.timestamp is at just a few seconds before tResultSetMax,
        // manipulating block.timestamp by a few seconds to be > tResultSetMax
        // will cause this transaction to fail.
        // In that were to happen, it would then become the DoubleDice admin's reponsibility
        // to set the result via finalizeUnsetResult.
        // solhint-disable-next-line not-rely-on-time
        if (!(block.timestamp <= tResultSetMax)) revert TooLate();

        if (!(setOutcomeIndex < vfParams.nOutcomes)) revert OutcomeIndexOutOfRange();

        // CR-01: Regardless of whether block.timestamp has been manipulated by a few seconds or not,
        // tResultChallengeMax will always be set to CHALLENGE_WINDOW_DURATION seconds later.
        // solhint-disable-next-line not-rely-on-time
        resolution.tResultChallengeMax = (block.timestamp + CHALLENGE_WINDOW_DURATION).toUint32();

        resolution.setOutcomeIndex = setOutcomeIndex;
        resolution.state = ResolutionState.Set;
        emit ResultUpdate(vfId, _msgSender(), ResultUpdateAction.CreatorSetResult, setOutcomeIndex);
    }

    /// @notice Once 1 hour has passed and the set result remains unchallenged,
    /// anyone may call this function to resolve the VF.
    function confirmUnchallengedResult(uint256 vfId)
        external
        whenNotPaused
    {
        Resolution storage resolution = resolutions[vfId];
        if (!(resolution.state == ResolutionState.Set)) revert WrongResolutionState(resolution.state);

        // CR-01: If block.timestamp is just a few seconds past tResultChallengeMax,
        // manipulating block.timestamp by a few seconds to be <= tResultChallengeMax
        // will cause this transaction to fail.
        // If that were to happen, this transaction could simply be reattempted later.
        // solhint-disable-next-line not-rely-on-time
        if (!(block.timestamp > resolution.tResultChallengeMax)) revert TooEarly();

        resolution.state = ResolutionState.Complete;
        address creatorFeeBeneficiary = getVirtualFloorCreator(vfId);
        emit ResultUpdate(vfId, _msgSender(), ResultUpdateAction.SomeoneConfirmedUnchallengedResult, resolution.setOutcomeIndex);

        // nonReentrant
        // Since confirmUnchallengedResult is guarded by require(state == Set)
        // and state has now been moved to Complete,
        // any external calls made by _resolve cannot re-enter confirmUnchallengedResult.
        _resolve(vfId, resolution.setOutcomeIndex, creatorFeeBeneficiary);
    }

    function challengeSetResult(uint256 vfId, uint8 challengeOutcomeIndex)
        external
        whenNotPaused
    {
        Resolution storage resolution = resolutions[vfId];
        if (!(resolution.state == ResolutionState.Set)) revert WrongResolutionState(resolution.state);
        CreatedVirtualFloorParams memory vfParams = getVirtualFloorParams(vfId);
        if (!(challengeOutcomeIndex < vfParams.nOutcomes)) revert OutcomeIndexOutOfRange();
        if (!(challengeOutcomeIndex != resolution.setOutcomeIndex)) revert ChallengeOutcomeIndexEqualToSet();

        // CR-01: If block.timestamp is at just a few seconds before tResultChallengeMax,
        // manipulating block.timestamp by a few seconds to be > tResultChallengeMax
        // will cause this transaction to fail.
        // If that were to happen, it would then become possible for the unchallenged result
        // to be confirmed via confirmUnchallengedResult, thus concluding the VF.
        // To protect against this scenario, CHALLENGE_WINDOW_DURATION is configured to be
        // much larger than the amount of time by which a miner could possibly manipulate block.timestamp.
        // solhint-disable-next-line not-rely-on-time
        if (!(block.timestamp <= resolution.tResultChallengeMax)) revert TooLate();

        resolution.challengeOutcomeIndex = challengeOutcomeIndex;
        resolution.challenger = _msgSender();
        resolution.state = ResolutionState.Challenged;
        emit ResultUpdate(vfId, _msgSender(), ResultUpdateAction.SomeoneChallengedSetResult, challengeOutcomeIndex);

        // nonReentrant
        // Since challengeSetResult is guarded by require(state == Set)
        // and state has now been moved to Challenged,
        // the following external safeTransferFrom call cannot re-enter challengeSetResult.
        _bondUsdErc20Token.safeTransferFrom(_msgSender(), address(this), _bondAmount());
    }

    function finalizeChallenge(uint256 vfId, uint8 finalOutcomeIndex)
        external
        onlyRole(OPERATOR_ROLE)
    {
        Resolution storage resolution = resolutions[vfId];
        if (!(resolution.state == ResolutionState.Challenged)) revert WrongResolutionState(resolution.state);
        address creatorFeeBeneficiary;
        address challengeBondBeneficiary;
        if (finalOutcomeIndex == resolution.setOutcomeIndex) {
            // VF-owner proven correct
            creatorFeeBeneficiary = getVirtualFloorCreator(vfId);
            challengeBondBeneficiary = platformFeeBeneficiary();
        } else if (finalOutcomeIndex == resolution.challengeOutcomeIndex) {
            // Challenger proven correct
            creatorFeeBeneficiary = platformFeeBeneficiary();
            challengeBondBeneficiary = resolution.challenger;
        } else {
            // Neither VF-owner nor challenger were correct
            creatorFeeBeneficiary = platformFeeBeneficiary();
            challengeBondBeneficiary = platformFeeBeneficiary();
        }
        resolution.state = ResolutionState.Complete;
        emit ResultUpdate(vfId, _msgSender(), ResultUpdateAction.AdminFinalizedChallenge, finalOutcomeIndex);

        // nonReentrant
        // Since finalizeChallenge is guarded by require(state == Challenged)
        // and state has now been moved to Complete,
        // the external safeTransfer call, as well as any external calls made by _resolve,
        // cannot re-enter finalizeChallenge.
        _bondUsdErc20Token.safeTransfer(challengeBondBeneficiary, _bondAmount());
        _resolve(vfId, finalOutcomeIndex, creatorFeeBeneficiary);
    }

    /// @notice If the underlying VF has been cancelled by a DoubleDice admin
    /// after being flagged by the community, and a challenger has paid a challenge-bond,
    /// this function may be called by *anyone*, and it will refund the bond to the the challenger.
    function _onVirtualFloorConclusion(uint256 vfId) internal virtual override {
        if (getVirtualFloorState(vfId) == VirtualFloorState.Claimable_Refunds_Flagged) {
            Resolution storage resolution = resolutions[vfId];
            if (resolution.state == ResolutionState.Challenged) {
                resolution.state = ResolutionState.ChallengeCancelled;
                _bondUsdErc20Token.safeTransfer(resolution.challenger, _bondAmount());
            }
        }
    }

    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
