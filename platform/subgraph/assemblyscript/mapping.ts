/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  Address,
  BigDecimal,
  BigInt,
  ethereum,
  log
} from '@graphprotocol/graph-ts';
import {
  CreationQuotaAdjustments as CreationQuotaAdjustmentsEvent,
  PaymentTokenWhitelistUpdate as PaymentTokenWhitelistUpdateEvent,
  ResultUpdate as ResultUpdateEvent,
  TransferBatch as TransferBatchEvent,
  TransferSingle as TransferSingleEvent,
  UserCommitment as UserCommitmentEvent,
  VirtualFloorCancellationFlagged as VirtualFloorCancellationFlaggedEvent,
  VirtualFloorCancellationUnresolvable as VirtualFloorCancellationUnresolvableEvent,
  VirtualFloorCreation as VirtualFloorCreationEvent,
  VirtualFloorResolution as VirtualFloorResolutionEvent
} from '../../generated/DoubleDice/DoubleDice';
import {
  IERC20Metadata
} from '../../generated/DoubleDice/IERC20Metadata';
import {
  Category,
  Opponent,
  Outcome,
  OutcomeTimeslot,
  OutcomeTimeslotTransfer,
  PaymentToken,
  ResultSource,
  Subcategory,
  User,
  VirtualFloor,
  VirtualFloorsAggregate
} from '../../generated/schema';
import {
  ResultUpdateAction,
  VirtualFloorResolutionType
} from '../../lib/helpers/sol-enums';
import {
  CHALLENGE_WINDOW_DURATION,
  SET_WINDOW_DURATION,
  SINGLETON_AGGREGATE_ENTITY_ID
} from './constants';
import {
  assertOutcomeTimeslotEntity,
  assertUserEntity,
  assertUserOutcomeEntity,
  assertUserOutcomeTimeslotEntity,
  createNewEntity,
  loadExistentEntity,
  loadOrCreateEntity
} from './entities';
import {
  decodeMetadata
} from './metadata';
import {
  paymentTokenAmountToBigDecimal,
  toDecimal
} from './utils';

// Manually mirrored from schema.graphql
const VirtualFloorState__Active_ResultChallenged = 'Active_ResultChallenged';
const VirtualFloorState__Active_ResultNone = 'Active_ResultNone';
const VirtualFloorState__Active_ResultSet = 'Active_ResultSet';
const VirtualFloorState__Claimable_Payouts = 'Claimable_Payouts';
const VirtualFloorState__Claimable_Refunds_Flagged = 'Claimable_Refunds_Flagged';
const VirtualFloorState__Claimable_Refunds_ResolvableNever = 'Claimable_Refunds_ResolvableNever';
const VirtualFloorState__Claimable_Refunds_ResolvedNoWinners = 'Claimable_Refunds_ResolvedNoWinners';

/**
 * It doesn't matter whether this token is being enabled or disabled, we are only using it to discover
 * new ERC-20 payment tokens that might later be used in virtual-floors.
 */
export function handlePaymentTokenWhitelistUpdate(event: PaymentTokenWhitelistUpdateEvent): void {
  const paymentTokenId = event.params.token.toHex();
  {
    const $ = loadOrCreateEntity<PaymentToken>(PaymentToken.load, paymentTokenId);
    /* if (isNew) */ {
      const paymentTokenContract = IERC20Metadata.bind(event.params.token);
      $.address = event.params.token;
      $.name = paymentTokenContract.name();
      $.symbol = paymentTokenContract.symbol();
      $.decimals = paymentTokenContract.decimals();
      $.save();
    }
  }
}


export function handleVirtualFloorCreation(event: VirtualFloorCreationEvent): void {
  log.warning('VirtualFloorCreation(id = {} = {})', [event.params.virtualFloorId.toString(), event.params.virtualFloorId.toHex()]);

  {
    const aggregate = loadOrCreateEntity<VirtualFloorsAggregate>(VirtualFloorsAggregate.load, SINGLETON_AGGREGATE_ENTITY_ID);
    aggregate.totalVirtualFloorsCreated += 1;
    aggregate.save()
  }

  const metadata = decodeMetadata(event.params.metadata);

  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const category = metadata.category;
    const subcategory = metadata.subcategory;

    const categoryId = category;
    {
      const categoryEntity = loadOrCreateEntity<Category>(Category.load, categoryId);
      /* if (isNew) */ {
        categoryEntity.slug = category;
        categoryEntity.save();
      }
    }

    const subcategoryId = `${category}-${subcategory}`;
    {
      const subcategoryEntity = loadOrCreateEntity<Subcategory>(Subcategory.load, subcategoryId);
      /* if (isNew) */ {
        subcategoryEntity.category = categoryId;
        subcategoryEntity.slug = subcategory;
        subcategoryEntity.save();
      }
    }

    const $ = createNewEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);

    $.intId = event.params.virtualFloorId;
    $.subcategory = subcategoryId;
    $.title = metadata.title;
    $.description = metadata.description;
    $.isListed = metadata.isListed;
    $.discordChannelId = metadata.discordChannelId;

    const userId = event.params.creator.toHex();
    {
      loadOrCreateEntity<User>(User.load, userId);
    }
    $.owner = userId;

    // should only be done *after* User entity exists
    adjustUserConcurrentVirtualFloors($.owner, +1);

    // Since the platform contract will reject VirtualFloors created with a PaymentToken that is not whitelisted,
    // we are sure that the PaymentToken entity referenced here will have always been created beforehand
    // when the token was originally whitelisted.
    $.paymentToken = event.params.paymentToken.toHex();

    $.betaOpen = toDecimal(event.params.betaOpen_e18);
    $.creationFeeRate = toDecimal(event.params.creationFeeRate_e18);
    $.platformFeeRate = toDecimal(event.params.platformFeeRate_e18);
    $.tCreated = event.block.timestamp;
    $.tOpen = event.params.tOpen;
    $.tClose = event.params.tClose;
    $.tResolve = event.params.tResolve;
    $.tResultSetMin = event.params.tResolve;
    $.tResultSetMax = event.params.tResolve.plus(SET_WINDOW_DURATION); // ToDo: Include this as event param tResultSetMax
    $.state = VirtualFloorState__Active_ResultNone;

    const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, $.paymentToken);

    const decimalBonusAmount = paymentTokenAmountToBigDecimal(event.params.bonusAmount, paymentToken.decimals);
    $.bonusAmount = decimalBonusAmount;
    $.totalSupply = $.totalSupply.plus(decimalBonusAmount);

    $.minCommitmentAmount = paymentTokenAmountToBigDecimal(event.params.minCommitmentAmount, paymentToken.decimals);
    $.maxCommitmentAmount = paymentTokenAmountToBigDecimal(event.params.maxCommitmentAmount, paymentToken.decimals);

    $.save();
  }

  {
    const opponents = metadata.opponents;
    for (let opponentIndex = 0; opponentIndex < opponents.length; opponentIndex++) {
      const opponent = opponents[opponentIndex];
      const title = opponent.title;
      const image = opponent.image;
      const opponentId = `${virtualFloorId}-${opponentIndex}`;
      {
        const $ = createNewEntity<Opponent>(Opponent.load, opponentId);
        $.virtualFloor = virtualFloorId;
        $.title = title;
        $.image = image;
        $.save();
      }
    }
  }

  {
    const resultSources = metadata.resultSources;
    for (let resultSourceIndex = 0; resultSourceIndex < resultSources.length; resultSourceIndex++) {
      const resultSource = resultSources[resultSourceIndex];
      const title = resultSource.title;
      const url = resultSource.url;
      const resultSourceId = `${virtualFloorId}-${resultSourceIndex}`;
      {
        const $ = createNewEntity<ResultSource>(ResultSource.load, resultSourceId);
        $.virtualFloor = virtualFloorId;
        $.title = title;
        $.url = url;
        $.save();
      }
    }
  }

  {
    const outcomes = metadata.outcomes;
    assert(
      outcomes.length == event.params.nOutcomes,
      'outcomeValues.length = ' + outcomes.length.toString()
      + ' != event.params.nOutcomes = ' + event.params.nOutcomes.toString());

    for (let outcomeIndex = 0; outcomeIndex < event.params.nOutcomes; outcomeIndex++) {
      const outcome = outcomes[outcomeIndex];
      const title = outcome.title;
      const outcomeId = `${virtualFloorId}-${outcomeIndex}`;
      {
        const $ = createNewEntity<Outcome>(Outcome.load, outcomeId);
        $.virtualFloor = virtualFloorId;
        $.title = title;
        $.index = outcomeIndex;
        $.save();
      }
    }
  }
}


function convertPaymentTokenAmountToDecimal(vfEntityId: string, amount: BigInt): BigDecimal {
  const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, vfEntityId);
  const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, $.paymentToken);
  return paymentTokenAmountToBigDecimal(amount, paymentToken.decimals);
}



export function handleUserCommitment(event: UserCommitmentEvent): void {
  const vfEntityId = event.params.virtualFloorId.toHex();
  const outcomeEntityId = `${vfEntityId}-${event.params.outcomeIndex}`;
  const outcomeTimeslotEntityId = event.params.tokenId.toHex(); // ToDo: To 32 bytes
  const fromUserId = Address.zero().toHex();
  // Note: We use an explicit `committer` param rather than relying on the underlying `event.transaction.from`
  // as if the transaction were being relayed by a 3rd party,
  // the commitment would be mistakenly attributed to the relayer.
  const toUserEntityId = event.params.committer.toHex();

  const beta = toDecimal(event.params.beta_e18);

  assertOutcomeTimeslotEntity(outcomeTimeslotEntityId,
    outcomeEntityId,
    event.params.timeslot,
    event.params.tokenId,
    beta
  );

  assertUserEntity(fromUserId);

  assertUserEntity(toUserEntityId);

  // Possibly this handler could simply instantiate the entities and exit at this point,
  // and then let the balances be updated in the handleTransferSingle executed
  // soon after during the same transaction.
  // But this would make the code depend on the ordering of events.
  // It might work, but it needs to be tested.
  // So instead, we update the balances right here,
  // and then during the handling of transfers, we skip mints.
  handleTransfers(event, Address.zero(), event.params.committer, [event.params.tokenId], [event.params.amount]);
}

export function handleTransferSingle(event: TransferSingleEvent): void {
  // For mints, do not handle TransferSingle event itself, as this is already handled in handleUserCommitment
  if (event.params.from.equals(Address.zero())) {
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, [event.params.id], [event.params.value]);
}

export function handleTransferBatch(event: TransferBatchEvent): void {
  // For mints, do not handle TransferBatch event itself, as this is already handled in handleUserCommitment
  if (event.params.from.equals(Address.zero())) {
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, event.params.ids, event.params.values);
}

function handleTransfers(event: ethereum.Event, from: Address, to: Address, ids: BigInt[], values: BigInt[]): void {
  assert(ids.length == values.length);

  const isMint = from.equals(Address.zero());

  const fromUserEntityId = from.toHex();
  const toUserEntityId = to.toHex();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const value = values[i];

    const outcomeTimeslotEntityId = id.toHex();
    const fromUserOutcomeTimeslotId = `${outcomeTimeslotEntityId}-${fromUserEntityId}`;
    const toUserOutcomeTimeslotId = `${outcomeTimeslotEntityId}-${toUserEntityId}`;

    const outcomeTimeslot = assert(OutcomeTimeslot.load(outcomeTimeslotEntityId));
    const outcomeEntityId = outcomeTimeslot.outcome;
    const outcome = assert(Outcome.load(outcomeEntityId));
    const vfEntityId = outcome.virtualFloor;
    const amount = convertPaymentTokenAmountToDecimal(vfEntityId, value);
    const beta = outcomeTimeslot.beta;

    const fromUserOutcomeEntityId = `${outcomeEntityId}-${fromUserEntityId}`;
    const toUserOutcomeEntityId = `${outcomeEntityId}-${toUserEntityId}`;

    // We debit (credit -amount) the "from" hierarchy, and credit the "to" hierarchy.

    if (!isMint) {
      creditEntityHierarchy(
        vfEntityId,
        outcomeEntityId,
        outcomeTimeslotEntityId,
        fromUserEntityId,
        fromUserOutcomeEntityId,
        fromUserOutcomeTimeslotId,
        amount.neg(),
        beta
      );
    }

    // Credit `to` even if it is address(0) and this is an ERC-1155 balance-burn,
    // as like that the totals will still remain under the VirtualFloor, Outcome, OutcomeTimeslot, etc.
    // They will be credited to address(0), so this address will eventually accumulate a lot of balance,
    // but it doesn't matter!
    // Doing it this way keeps things simple: the balance doesn't perish, it simply "changes ownership" to address(0)
    creditEntityHierarchy(
      vfEntityId,
      outcomeEntityId,
      outcomeTimeslotEntityId,
      toUserEntityId,
      toUserOutcomeEntityId,
      toUserOutcomeTimeslotId,
      amount,
      beta
    );

    const posOfEventInTx = event.transactionLogIndex;
    const outcomeTimeslotTransferEntityId = `${outcomeTimeslotEntityId}-${event.transaction.hash.toHex()}-${posOfEventInTx}-${i}`;
    const outcomeTimeslotTransferEntity = createNewEntity<OutcomeTimeslotTransfer>(OutcomeTimeslotTransfer.load, outcomeTimeslotTransferEntityId);
    outcomeTimeslotTransferEntity.outcomeTimeslot = outcomeTimeslotEntityId;
    outcomeTimeslotTransferEntity.from = fromUserEntityId;
    outcomeTimeslotTransferEntity.to = toUserEntityId;
    outcomeTimeslotTransferEntity.timestamp = event.block.timestamp;
    outcomeTimeslotTransferEntity.amount = amount;
    outcomeTimeslotTransferEntity.save();
  }
}

function creditEntityHierarchy(
  existentVfEntityId: string,
  existentOutcomeEntityId: string,
  existentOutcomeTimeslotEntityId: string,
  userEntityId: string,
  userOutcomeEntityId: string,
  userOutcomeTimeslotEntityId: string,
  amount: BigDecimal,
  beta: BigDecimal
): void {
  const amountTimesBeta = amount.times(beta);

  const vfEntity = loadExistentEntity<VirtualFloor>(VirtualFloor.load, existentVfEntityId);
  vfEntity.totalSupply = vfEntity.totalSupply.plus(amount);
  vfEntity.save();

  const outcomeEntity = loadExistentEntity<Outcome>(Outcome.load, existentOutcomeEntityId);
  outcomeEntity.totalSupply = outcomeEntity.totalSupply.plus(amount);
  outcomeEntity.totalWeightedSupply = outcomeEntity.totalWeightedSupply.plus(amountTimesBeta);
  outcomeEntity.save();

  const outcomeTimeslotEntity = loadExistentEntity<OutcomeTimeslot>(OutcomeTimeslot.load, existentOutcomeTimeslotEntityId);
  outcomeTimeslotEntity.totalSupply = outcomeTimeslotEntity.totalSupply.plus(amount);
  outcomeTimeslotEntity.save();

  assertUserEntity(userEntityId,
  );

  const userOutcomeEntity = assertUserOutcomeEntity(userOutcomeEntityId,
    userEntityId,
    existentOutcomeEntityId
  );
  userOutcomeEntity.totalBalance = userOutcomeEntity.totalBalance.plus(amount);
  userOutcomeEntity.totalWeightedBalance = userOutcomeEntity.totalWeightedBalance.plus(amountTimesBeta);
  userOutcomeEntity.save();

  const userOutcomeTimeslotEntity = assertUserOutcomeTimeslotEntity(userOutcomeTimeslotEntityId,
    userEntityId,
    existentOutcomeEntityId,
    outcomeTimeslotEntity.timeslot, // ToDo: Deprecate
    userOutcomeEntityId,
    existentOutcomeTimeslotEntityId
  );
  userOutcomeTimeslotEntity.balance = userOutcomeTimeslotEntity.balance.plus(amount);
  userOutcomeTimeslotEntity.save();
}

export function handleVirtualFloorCancellationUnresolvable(event: VirtualFloorCancellationUnresolvableEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    adjustUserConcurrentVirtualFloors($.owner, -1);
    $.state = VirtualFloorState__Claimable_Refunds_ResolvableNever;
    $.save();
  }
}

export function handleVirtualFloorCancellationFlagged(event: VirtualFloorCancellationFlaggedEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    adjustUserConcurrentVirtualFloors($.owner, -1);
    $.state = VirtualFloorState__Claimable_Refunds_Flagged;
    $.flaggingReason = event.params.reason;
    $.save();
  }
}

export function handleVirtualFloorResolution(event: VirtualFloorResolutionEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);

    adjustUserConcurrentVirtualFloors($.owner, -1);

    switch (event.params.resolutionType) {
      case VirtualFloorResolutionType.NoWinners:
        $.state = VirtualFloorState__Claimable_Refunds_ResolvedNoWinners;
        break;
      case VirtualFloorResolutionType.Winners:
        $.state = VirtualFloorState__Claimable_Payouts;
        break;
    }

    {
      const winningOutcomeId = `${virtualFloorId}-${event.params.winningOutcomeIndex}`;
      $.winningOutcome = winningOutcomeId;
    }

    {
      const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, $.paymentToken);
      $.winnerProfits = paymentTokenAmountToBigDecimal(event.params.winnerProfits, paymentToken.decimals);
    }

    $.save();
  }
}


export function handleCreationQuotaAdjustments(event: CreationQuotaAdjustmentsEvent): void {
  const adjustments = event.params.adjustments;
  for (let i = 0; i < adjustments.length; i++) {
    const userId = adjustments[i].creator.toHex();
    const user = loadOrCreateEntity<User>(User.load, userId);
    user.maxConcurrentVirtualFloors = user.maxConcurrentVirtualFloors.plus(adjustments[i].relativeAmount);
    user.save();
  }
}

function adjustUserConcurrentVirtualFloors(userId: string, adjustment: i32): void {
  const user = loadExistentEntity<User>(User.load, userId);
  user.concurrentVirtualFloors = user.concurrentVirtualFloors.plus(BigInt.fromI32(adjustment));
  user.save();
}

export function handleResultUpdate(event: ResultUpdateEvent): void {
  const vfEntityId = event.params.vfId.toHex();
  const vf = loadExistentEntity<VirtualFloor>(VirtualFloor.load, vfEntityId);
  const winningOutcomeId = `${vfEntityId}-${event.params.outcomeIndex}`;
  vf.winningOutcome = winningOutcomeId;

  switch (event.params.action) {
    case ResultUpdateAction.CreatorSetResult:
      vf.state = VirtualFloorState__Active_ResultSet;
      vf.tResultChallengeMax = event.block.timestamp.plus(CHALLENGE_WINDOW_DURATION); // ToDo: Include this as event param tChallengeMax
      break;
    case ResultUpdateAction.SomeoneChallengedSetResult: {
      vf.state = VirtualFloorState__Active_ResultChallenged;

      const challengerUserId = event.params.operator.toHex();
      loadOrCreateEntity<User>(User.load, challengerUserId);
      vf.challenger = challengerUserId;

      break;
    }
    case ResultUpdateAction.AdminFinalizedUnsetResult:
    case ResultUpdateAction.SomeoneConfirmedUnchallengedResult:
    case ResultUpdateAction.AdminFinalizedChallenge:
      // No need to handle these, as these will all result in a separate `VirtualFloorResolution` event,
      // which will be handled by `handleVirtualFloorResultion`
      break;
  }
  vf.save();
}
