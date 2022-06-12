// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./ForkedERC1155UpgradeableV4_5_2.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./ExtraStorageGap.sol";
import "./interface/IDoubleDice.sol";
import "./library/ERC1155TokenIds.sol";
import "./library/FixedPointTypes.sol";
import "./library/Utils.sol";
import "./library/VirtualFloorCreationParamsUtils.sol";
import "./library/VirtualFloors.sol";
import "./MultipleInheritanceOptimization.sol";

/// @dev 255 not 256, because we store nOutcomes in a uint8
uint256 constant _MAX_OUTCOMES_PER_VIRTUAL_FLOOR = 255;

UFixed256x18 constant _BETA_CLOSE = UFIXED256X18_ONE;

struct OutcomeTotals {
    uint256 amount;
    UFixed256x18 amountTimesBeta_e18;
}

enum VirtualFloorInternalState {
    None,
    Active,                              // formerly RunningOrClosed
    Claimable_Payouts,                   // formerly ResolvedWinners
    Claimable_Refunds_ResolvedNoWinners, // formerly CancelledResolvedNoWinners
    Claimable_Refunds_ResolvableNever,   // formerly CancelledUnresolvable
    Claimable_Refunds_Flagged            // formerly CancelledFlagged
}

struct VirtualFloor {

    // Storage slot 0
    address creator; //   20 bytes
    uint32 tOpen;    // +  4 bytes
    uint32 tClose;   // +  4 bytes 
    uint32 tResolve; // +  4 bytes
                     // = 32 bytes => packed into 1 32-byte slot

    // Storage slot 1
    UFixed32x6 betaOpenMinusBetaClose;        // +  4 bytes ; fits with 6-decimal-place precision all values up to ~4000.000000
    UFixed16x4 creationFeeRate;               // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    UFixed16x4 platformFeeRate;               // +  2 bytes ; fits with 4-decimal-place precision entire range [0.0000, 1.0000]
    uint8 nOutcomes;                          // +  1 byte
    VirtualFloorInternalState _internalState; // +  1 byte
    uint8 nonzeroOutcomeCount;                // +  1 byte  ; number of outcomes having aggregate commitments > 0
    IERC20Upgradeable paymentToken;           // + 20 bytes
                                              // = 31 bytes => packed into 1 32-byte slot

    // Storage slot 2: Not written to, but used in calculation of outcome-specific slots
    // Note: A fixed-length array is used to not an entire 32-byte slot to write array-length,
    // but instead store the length in 1 byte in `nOutcomes`
    OutcomeTotals[_MAX_OUTCOMES_PER_VIRTUAL_FLOOR] outcomeTotals;

    // Storage slot 3: Slot written to during resolve
    uint8 winningOutcomeIndex; // +  1 byte
    uint192 winnerProfits;     // + 24 bytes ; fits with 18-decimal-place precision all values up to ~1.5e30 (and with less decimals, more)
                               // = 25 bytes => packed into 1 32-byte slot

    uint256 bonusAmount;

    // Pack into 1 storage slot
    // _prefixed as they are not meant to be read directly,
    // but through .minMaxCommitmentAmounts() 
    uint128 _optionalMinCommitmentAmount;
    uint128 _optionalMaxCommitmentAmount;
}

abstract contract BaseDoubleDice is
    IDoubleDice,
    ForkedERC1155UpgradeableV4_5_2,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ExtraStorageGap,
    MultipleInheritanceOptimization
{
    using ERC1155TokenIds for uint256;
    using FixedPointTypes for UFixed16x4;
    using FixedPointTypes for UFixed256x18;
    using FixedPointTypes for UFixed32x6;
    using FixedPointTypes for uint256;
    using SafeCastUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using Utils for uint256;
    using VirtualFloorCreationParamsUtils for VirtualFloorCreationParams;
    using VirtualFloors for VirtualFloor;

    // ---------- Storage ----------

    mapping(uint256 => VirtualFloor) private _vfs;

    address private _platformFeeBeneficiary;

    UFixed16x4 private _platformFeeRate;

    string private _contractURI;

    mapping(IERC20Upgradeable => bool) private _paymentTokenWhitelist;


    // ---------- Setup & config ----------

    struct BaseDoubleDiceInitParams {
        string tokenMetadataUriTemplate;
        address platformFeeBeneficiary;
        UFixed256x18 platformFeeRate_e18;
        string contractURI;
    }

    function __BaseDoubleDice_init(BaseDoubleDiceInitParams calldata params)
        internal
        onlyInitializing
        multipleInheritanceRootInitializer
    {
        __ERC1155_init(params.tokenMetadataUriTemplate);
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setPlatformFeeBeneficiary(params.platformFeeBeneficiary);
        _setPlatformFeeRate(params.platformFeeRate_e18);
        _setContractURI(params.contractURI);
    }


    // ---------- External setters, exclusive to ADMIN ----------

    function setTokenMetadataUriTemplate(string calldata template) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(template);
    }

    function setPlatformFeeBeneficiary(address platformFeeBeneficiary_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeBeneficiary(platformFeeBeneficiary_);
    }

    function setPlatformFeeRate_e18(UFixed256x18 platformFeeRate_e18_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPlatformFeeRate(platformFeeRate_e18_);
    }

    function setContractURI(string memory contractURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setContractURI(contractURI_);
    }

    function updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updatePaymentTokenWhitelist(token, isWhitelisted);
    }


    // ---------- Internal setters ----------

    function _setPlatformFeeBeneficiary(address platformFeeBeneficiary_) internal {
        _platformFeeBeneficiary = platformFeeBeneficiary_;
        emit PlatformFeeBeneficiaryUpdate(platformFeeBeneficiary_);
    }

    function _setPlatformFeeRate(UFixed256x18 platformFeeRate) internal {
        if (!platformFeeRate.lte(UFIXED256X18_ONE)) revert PlatformFeeRateTooLarge();
        _platformFeeRate = platformFeeRate.toUFixed16x4();
        emit PlatformFeeRateUpdate(platformFeeRate);
    }

    function _setContractURI(string memory contractURI_) internal {
        _contractURI = contractURI_;
        emit ContractURIUpdate(contractURI_);
    }

    function _updatePaymentTokenWhitelist(IERC20Upgradeable token, bool isWhitelisted) internal {
        _paymentTokenWhitelist[token] = isWhitelisted;
        emit PaymentTokenWhitelistUpdate(token, isWhitelisted);
    }


    // ---------- Public getters ----------

    /// @dev The term ADMIN reserves a special significance within the AccessControl framework,
    /// so we avoid using it in the role name.
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    function platformFeeBeneficiary() public view returns (address) {
        return _platformFeeBeneficiary;
    }

    /// @notice The current platform-fee rate as a proportion of the creator-fee taken
    /// on virtualfloor resolution.
    /// E.g. 1.25% would be returned as 0.0125e18
    function platformFeeRate_e18() external view returns (UFixed256x18) {
        return _platformFeeRate.toUFixed256x18();
    }

    /// @notice Returns a URL for the OpenSea storefront-level metadata for this contract
    /// @dev See https://docs.opensea.io/docs/contract-level-metadata
    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function isPaymentTokenWhitelisted(IERC20Upgradeable token) public view returns (bool) {
        return _paymentTokenWhitelist[token];
    }

    function getVirtualFloorState(uint256 vfId) public view returns (VirtualFloorState) {
        return _vfs[vfId].state();
    }

    function getVirtualFloorCreator(uint256 vfId) public view returns (address) {
        return _vfs[vfId].creator;
    }

    function getVirtualFloorParams(uint256 vfId) public view returns (CreatedVirtualFloorParams memory) {
        VirtualFloor storage vf = _vfs[vfId];
        (uint256 minCommitmentAmount, uint256 maxCommitmentAmount) = vf.minMaxCommitmentAmounts();
        return CreatedVirtualFloorParams({
            betaOpen_e18: vf.betaOpenMinusBetaClose.toUFixed256x18().add(_BETA_CLOSE),
            creationFeeRate_e18: vf.creationFeeRate.toUFixed256x18(),
            platformFeeRate_e18: vf.platformFeeRate.toUFixed256x18(),
            tOpen: vf.tOpen,
            tClose: vf.tClose,
            tResolve: vf.tResolve,
            nOutcomes: vf.nOutcomes,
            paymentToken: vf.paymentToken,
            bonusAmount: vf.bonusAmount,
            minCommitmentAmount: minCommitmentAmount,
            maxCommitmentAmount: maxCommitmentAmount,
            creator: vf.creator
        });
    }

    function getVirtualFloorOutcomeTotals(uint256 vfId, uint8 outcomeIndex) public view returns (OutcomeTotals memory) {
        return _vfs[vfId].outcomeTotals[outcomeIndex];
    }


    // ---------- Virtual-floor lifecycle ----------

    function createVirtualFloor(VirtualFloorCreationParams calldata params)
        public
        whenNotPaused
    {

        // Pure value validation
        params.validatePure();

        // Validation against block

        // CR-01: If block.timestamp is just a few seconds before tCreateMax,
        // manipulating block.timestamp by a few seconds to be > tCreateMax
        // would cause this transaction to fail,
        // and the creator would have to re-attempt the transaction.
        // solhint-disable-next-line not-rely-on-time
        if (!(block.timestamp <= params.tCreateMax())) revert TooLate();

        VirtualFloor storage vf = _vfs[params.virtualFloorId];

        // Validation against storage
        if (!(vf._internalState == VirtualFloorInternalState.None)) revert DuplicateVirtualFloorId();
        if (!isPaymentTokenWhitelisted(params.paymentToken)) revert PaymentTokenNotWhitelisted();

        vf._internalState = VirtualFloorInternalState.Active;
        vf.creator = _msgSender();
        vf.betaOpenMinusBetaClose = params.betaOpen_e18.sub(_BETA_CLOSE).toUFixed32x6();
        vf.creationFeeRate = params.creationFeeRate_e18.toUFixed16x4();
        vf.platformFeeRate = _platformFeeRate; // freeze current global platformFeeRate
        vf.tOpen = params.tOpen;
        vf.tClose = params.tClose;
        vf.tResolve = params.tResolve;
        vf.nOutcomes = params.nOutcomes;
        vf.paymentToken = params.paymentToken;

        if (params.bonusAmount > 0) {
            vf.bonusAmount = params.bonusAmount;

            // For the purpose of knowing whether a VF is unresolvable,
            // the bonus amount is equivalent to a commitment to a "virtual" outcome
            // that never wins, but only serves the purpose of increasing the total
            // amount committed to the VF
            vf.nonzeroOutcomeCount += 1;

            // nonReentrant
            // Since createVirtualFloor is guarded by require(_internalState == None)
            // and _internalState has now been moved to Active,
            // the following external safeTransferFrom call cannot re-enter createVirtualFloor.
            params.paymentToken.safeTransferFrom(_msgSender(), address(this), params.bonusAmount);
        }

        uint256 min;
        uint256 max;
        {
            // First store raw values ...
            vf._optionalMinCommitmentAmount = params.optionalMinCommitmentAmount.toUint128();
            vf._optionalMaxCommitmentAmount = params.optionalMaxCommitmentAmount.toUint128();
            // ... then validate values returned through the library getter.
            (min, max) = vf.minMaxCommitmentAmounts();
            if (!(_MIN_POSSIBLE_COMMITMENT_AMOUNT <= min && min <= max && max <= _MAX_POSSIBLE_COMMITMENT_AMOUNT)) revert InvalidMinMaxCommitmentAmounts();
        }

        // Extracting this value to a local variable
        // averts a "Stack too deep" CompilerError in the
        // subsequent `emit`
        EncodedVirtualFloorMetadata calldata metadata = params.metadata;

        emit VirtualFloorCreation({
            virtualFloorId: params.virtualFloorId,
            creator: vf.creator,
            betaOpen_e18: params.betaOpen_e18,
            creationFeeRate_e18: params.creationFeeRate_e18,
            platformFeeRate_e18: _platformFeeRate.toUFixed256x18(),
            tOpen: params.tOpen,
            tClose: params.tClose,
            tResolve: params.tResolve,
            nOutcomes: params.nOutcomes,
            paymentToken: params.paymentToken,
            bonusAmount: params.bonusAmount,
            minCommitmentAmount: min,
            maxCommitmentAmount: max,
            metadata: metadata
        });

        // nonReentrant
        // Since createVirtualFloor is guarded by require(_internalState == None)
        // and _internalState has now been moved to Active,
        // any external calls made by _onVirtualFloorCreation cannot re-enter createVirtualFloor.
        //
        // Hooks might want to read VF values from storage, so hook-call must happen last.
        _onVirtualFloorCreation(params);
    }

    function commitToVirtualFloor(uint256 vfId, uint8 outcomeIndex, uint256 amount, uint256 optionalDeadline)
        public
        whenNotPaused
        nonReentrant
    {
        // Note: if-condition is a minor gas optimization; it costs ~20 gas more to perform the if-test,
        // but it is ~400 gas cheaper if the deadline is left specified.
        if (optionalDeadline != UNSPECIFIED_ZERO) {
            // CR-01: To avoid a scenario where a commitment is mined so late that it might no longer favourable
            // to the committer to make that commitment, it is possible to specify the maximum time
            // until which the commitment may be mined.
            // solhint-disable-next-line not-rely-on-time
            if (!(block.timestamp <= optionalDeadline)) revert CommitmentDeadlineExpired();
        }

        VirtualFloor storage vf = _vfs[vfId];

        if (!vf.isOpen()) revert WrongVirtualFloorState(vf.state());

        if (!(outcomeIndex < vf.nOutcomes)) revert OutcomeIndexOutOfRange();

        (uint256 minAmount, uint256 maxAmount) = vf.minMaxCommitmentAmounts();
        if (!(minAmount <= amount && amount <= maxAmount)) revert CommitmentAmountOutOfRange();

        vf.paymentToken.safeTransferFrom(_msgSender(), address(this), amount);

        // Commitments made at t < tOpen will all be accumulated into the same timeslot == tOpen,
        // and will therefore be assigned the same beta == betaOpen.
        // This means that all commitments to a specific outcome that happen at t <= tOpen
        // will be minted as balances on the the same ERC-1155 tokenId, which means that
        // these balances will be exchangeable/tradeable/fungible between themselves,
        // but they will not be fungible with commitments to the same outcome that arrive later.
        //
        // CR-01: Manipulating block.timestamp to be a few seconds later would
        // result in a fractionally lower beta.
        // solhint-disable-next-line not-rely-on-time
        uint256 timeslot = MathUpgradeable.max(vf.tOpen, block.timestamp);

        UFixed256x18 beta_e18 = vf.betaOf(timeslot);
        OutcomeTotals storage outcomeTotals = vf.outcomeTotals[outcomeIndex];

        // Only increment this counter the first time an outcome is committed to.
        // In this way, this counter will be updated maximum nOutcome times over the entire commitment period.
        // Some gas could be saved here by marking as unchecked, and by not counting beyond 2,
        // but we choose to forfeit these micro-optimizations to retain simplicity.
        if (outcomeTotals.amount == 0) {
            vf.nonzeroOutcomeCount += 1;
        }

        outcomeTotals.amount += amount;
        outcomeTotals.amountTimesBeta_e18 = outcomeTotals.amountTimesBeta_e18.add(beta_e18.mul0(amount));

        uint256 tokenId = ERC1155TokenIds.vfOutcomeTimeslotIdOf(vfId, outcomeIndex, timeslot);

        // From the Graph's point of view...
        // First we declare the parameters bound to a particular tokenId...
        emit UserCommitment({
            virtualFloorId: vfId,
            committer: _msgSender(),
            outcomeIndex: outcomeIndex,
            timeslot: timeslot,
            amount: amount,
            beta_e18: beta_e18,
            tokenId: tokenId
        });

        // ... and only then do we refer to it in transfers.
        _mint({
            to: _msgSender(),
            id: tokenId,
            amount: amount,
            data: hex""
        });
    }

    /// @dev Hook into transfer process to block transfers of
    /// commitment-type token balances that are tied to virtual-floors
    /// that are in the wrong state and time-period.
    function _beforeTokenTransfer(
        address /*operator*/,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory /*amounts*/,
        bytes memory /*data*/
    )
        internal
        override
        virtual
    {
        // Skip empty "super._beforeTokenTransfer(operator, from, to, ids, amounts, data);"

        // No restrictions on mint/burn
        //        
        // EN-01: Since this hook is invoked routinely as part of the regular commit/claim process,
        // this check is performed before all other checks, even before checking paused(),
        // to avoid wasting gas on SLOADs or on other relatively expensive operations.
        if (from == address(0) || to == address(0)) {
            return;
        }

        if (paused()) revert CommitmentBalanceTransferWhilePaused();

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            VirtualFloorState state = _vfs[id.extractVirtualFloorId()].state();
            if (!(state == VirtualFloorState.Active_Open_ResolvableLater || state == VirtualFloorState.Active_Closed_ResolvableLater)) {
                revert CommitmentBalanceTransferRejection(id, state);
            }
        }
    }

    /// @notice A virtual-floor's commitment period closes at `tClose`.
    /// If at this point there are zero commitments to zero outcomes,
    /// or there are > 0 commitments, but all to a single outcome,
    /// then this virtual-floor is considered unconcludeable.
    /// For such a virtual-floor:
    /// 1. The only possible action for this virtual-floor is to cancel it via this function,
    ///    which may be invoked by anyone without restriction.
    /// 2. Any ERC-1155 commitment-type token balance associated with this virtual-floor is untransferable
    function cancelVirtualFloorUnresolvable(uint256 vfId)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        VirtualFloorState state = vf.state();
        if (!(state == VirtualFloorState.Active_Closed_ResolvableNever)) revert WrongVirtualFloorState(state);
        vf._internalState = VirtualFloorInternalState.Claimable_Refunds_ResolvableNever;
        emit VirtualFloorCancellationUnresolvable(vfId);

        // nonReentrant
        // Since cancelVirtualFloorUnresolvable is guarded by require(_internalState == Active)
        // and _internalState has now been moved to Claimable_Refunds_ResolvableNever,
        // any external calls made from this point onwards cannot re-enter cancelVirtualFloorUnresolvable.

        vf.refundBonusAmount();

        _onVirtualFloorConclusion(vfId);
    }

    function cancelVirtualFloorFlagged(uint256 vfId, string calldata reason)
        public
        onlyRole(OPERATOR_ROLE)
    {
        VirtualFloor storage vf = _vfs[vfId];
        if (!(vf._internalState == VirtualFloorInternalState.Active)) revert WrongVirtualFloorState(vf.state());
        vf._internalState = VirtualFloorInternalState.Claimable_Refunds_Flagged;
        emit VirtualFloorCancellationFlagged(vfId, reason);

        // nonReentrant
        // Since cancelVirtualFloorFlagged is guarded by require(_internalState == Active)
        // and _internalState has now been moved to Claimable_Refunds_Flagged,
        // any external calls made from this point onwards cannot re-enter cancelVirtualFloorFlagged.

        vf.refundBonusAmount();

        _onVirtualFloorConclusion(vfId);
    }

    function _resolve(uint256 vfId, uint8 winningOutcomeIndex, address creatorFeeBeneficiary) internal {
        if (paused()) revert ResolveWhilePaused();

        VirtualFloor storage vf = _vfs[vfId];

        VirtualFloorState state = vf.state();
        if (!(state == VirtualFloorState.Active_Closed_ResolvableNow)) revert WrongVirtualFloorState(state);

        if (!(winningOutcomeIndex < vf.nOutcomes)) revert OutcomeIndexOutOfRange();

        vf.winningOutcomeIndex = winningOutcomeIndex;

        uint256 totalCommitmentsToAllOutcomesPlusBonus = vf.totalCommitmentsToAllOutcomesPlusBonus();
        uint256 totalCommitmentsToWinningOutcome = vf.outcomeTotals[winningOutcomeIndex].amount;

        // This used to be handled on this contract as a VirtualFloorResolution of type AllWinners,
        // but it can no longer happen, because if all commitments are to a single outcome,
        // transaction would have already been reverted because of
        // the condition nonzeroOutcomeCount == 1, which is < 2.
        // We retain this assertion as a form of documentation.
        assert(totalCommitmentsToWinningOutcome != totalCommitmentsToAllOutcomesPlusBonus);

        VirtualFloorResolutionType resolutionType;
        uint256 platformFeeAmount;
        uint256 creatorFeeAmount;
        uint256 totalWinnerProfits;

        if (totalCommitmentsToWinningOutcome == 0) {
            // This could happen if e.g. there are commitments to outcome #0 and outcome #1,
            // but not to outcome #2, and #2 is the winner.
            // In this case, the current ERC-1155 commitment-type token owner becomes eligible
            // to reclaim the equivalent original ERC-20 token amount,
            // i.e. to withdraw the current ERC-1155 balance as ERC-20 tokens.
            // Neither the creator nor the platform take any fees in this circumstance.
            vf._internalState = VirtualFloorInternalState.Claimable_Refunds_ResolvedNoWinners;
            resolutionType = VirtualFloorResolutionType.NoWinners;
            platformFeeAmount = 0;
            creatorFeeAmount = 0;
            totalWinnerProfits = 0;

            vf.refundBonusAmount();
        } else {
            vf._internalState = VirtualFloorInternalState.Claimable_Payouts;
            resolutionType = VirtualFloorResolutionType.Winners;

            // Winner commitments refunded, fee taken, then remainder split between winners proportionally by `commitment * beta`.
            uint256 maxTotalFeeAmount = vf.creationFeeRate.toUFixed256x18().mul0(totalCommitmentsToAllOutcomesPlusBonus).floorToUint256();

            // If needs be, limit the fee to ensure that there enough funds to be able to refund winner commitments in full.
            uint256 totalFeePlusTotalWinnerProfits = totalCommitmentsToAllOutcomesPlusBonus - totalCommitmentsToWinningOutcome;

            uint256 totalFeeAmount = MathUpgradeable.min(maxTotalFeeAmount, totalFeePlusTotalWinnerProfits);

            unchecked { // because b - min(a, b) >= 0
                totalWinnerProfits = totalFeePlusTotalWinnerProfits - totalFeeAmount;
            }
            vf.winnerProfits = totalWinnerProfits.toUint192();

            platformFeeAmount = vf.platformFeeRate.toUFixed256x18().mul0(totalFeeAmount).floorToUint256();
            vf.paymentToken.safeTransfer(_platformFeeBeneficiary, platformFeeAmount);

            unchecked { // because platformFeeRate <= 1.0
                creatorFeeAmount = totalFeeAmount - platformFeeAmount;
            }

            vf.paymentToken.safeTransfer(creatorFeeBeneficiary, creatorFeeAmount);
        }

        emit VirtualFloorResolution({
            virtualFloorId: vfId,
            winningOutcomeIndex: winningOutcomeIndex,
            resolutionType: resolutionType,
            winnerProfits: totalWinnerProfits,
            platformFeeAmount: platformFeeAmount,
            creatorFeeAmount: creatorFeeAmount
        });

        _onVirtualFloorConclusion(vfId);
    }


    // ---------- Claims ----------

    /// @notice Claim multiple refunds from a VF that has been cancelled.
    /// A tokenId may be included multiple times, but it will count only once.
    function claimRefunds(uint256 vfId, uint256[] calldata tokenIds)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        if (!vf.isClaimableRefunds()) revert WrongVirtualFloorState(vf.state());
        address msgSender = _msgSender();
        uint256 totalPayout = 0;
        uint256[] memory amounts = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            (uint256 extractedVfId, /*outcomeIndex*/, /*timeslot*/) = tokenId.destructure();
            if (!(extractedVfId == vfId)) revert MismatchedVirtualFloorId(tokenId);
            uint256 amount = _balances[tokenId][msgSender];
            amounts[i] = amount;
            if (amount > 0) {
                _balances[tokenId][msgSender] = 0;
                totalPayout += amount;
            }
        }
        emit TransferBatch(msgSender, msgSender, address(0), tokenIds, amounts);

        // nonReentrant
        // Since at this point in claimRefunds the ERC-1155 balances have already been drained,
        // the following external safeTransfer call cannot re-enter claimRefunds.
        vf.paymentToken.safeTransfer(msgSender, totalPayout);
    }

    /// @notice Claim payouts from a VF that has been resolved with winners.
    /// A tokenId may be included multiple times, but it will count only once.
    function claimPayouts(uint256 vfId, uint256[] calldata tokenIds)
        public
        whenNotPaused
    {
        VirtualFloor storage vf = _vfs[vfId];
        {
            VirtualFloorState state = vf.state();
            if (!(state == VirtualFloorState.Claimable_Payouts)) revert WrongVirtualFloorState(state);
        }
        address msgSender = _msgSender();
        uint256 totalPayout = 0;
        uint256[] memory amounts = new uint256[](tokenIds.length);
        uint8 winningOutcomeIndex = vf.winningOutcomeIndex;
        UFixed256x18 winningOutcomeTotalAmountTimesBeta = vf.outcomeTotals[winningOutcomeIndex].amountTimesBeta_e18;
        uint256 totalWinnerProfits = vf.winnerProfits;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            (uint256 extractedVfId, uint8 outcomeIndex, uint32 timeslot) = tokenId.destructure();
            if (!(extractedVfId == vfId)) revert MismatchedVirtualFloorId(tokenId);
            uint256 amount = _balances[tokenId][msgSender];
            amounts[i] = amount;
            _balances[tokenId][msgSender] = 0;
            if (outcomeIndex == winningOutcomeIndex) {
                UFixed256x18 beta = vf.betaOf(timeslot);
                UFixed256x18 amountTimesBeta = beta.mul0(amount);
                uint256 profit = amountTimesBeta.mul0(totalWinnerProfits).divToUint256(winningOutcomeTotalAmountTimesBeta);
                totalPayout += amount + profit;
            }
        }
        emit TransferBatch(msgSender, msgSender, address(0), tokenIds, amounts);

        // nonReentrant
        // Since at this point in claimPayouts the ERC-1155 balances have already been drained,
        // the following external safeTransfer call cannot re-enter claimPayouts.
        vf.paymentToken.safeTransfer(msgSender, totalPayout);
    }


    // ---------- ERC-165 support ----------

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165Upgradeable, ForkedERC1155UpgradeableV4_5_2, AccessControlUpgradeable)
        virtual // Leave door open for extending contracts to support further interfaces
        returns (bool)
    {
        return ForkedERC1155UpgradeableV4_5_2.supportsInterface(interfaceId) || AccessControlUpgradeable.supportsInterface(interfaceId);
    }


    // ---------- Lifecycle hooks ----------

    // solhint-disable-next-line no-empty-blocks
    function _onVirtualFloorCreation(VirtualFloorCreationParams calldata params) internal virtual {
    }

    // solhint-disable-next-line no-empty-blocks
    function _onVirtualFloorConclusion(uint256 vfId) internal virtual {        
    }


    // ---------- Pausability ----------

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }


    /// @dev See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[50] private __gap;
}
