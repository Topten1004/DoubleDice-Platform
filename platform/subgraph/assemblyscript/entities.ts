import {
  BigDecimal,
  BigInt
} from '@graphprotocol/graph-ts';
import {
  OutcomeTimeslot,
  User,
  UserOutcome,
  UserOutcomeTimeslot
} from '../../generated/schema';


interface Entity {
  save(): void
}

type LoadEntity<T> = (id: string) => T | null

export function createNewEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  assert(entity == null, `createNewEntity: Expected entity ${id} to NOT already exist`);
  entity = instantiate<T>(id);
  entity.save();
  return entity;
}

export function loadExistentEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  return assert(load(id), `loadExistentEntity: Expected entity ${id} to already exist`);
}

// ToDo: Ideally this would return { entity, isNew },
// so that caller could use isNew to run some code only the first time.
export function loadOrCreateEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity == null) {
    entity = instantiate<T>(id);
    entity.save();
  }
  return entity;
}

function assertFieldEqual<T>(entityName: string, id: string, fieldName: string, loadedFieldValue: T, expectedValue: T): void {
  // Note: Important to use == until === becomes supported
  assert(loadedFieldValue == expectedValue, `${entityName}(${id}).${fieldName} == ${loadedFieldValue} != ${expectedValue}`);
}

export function assertOutcomeTimeslotEntity(id: string,
  outcomeEntityId: string,
  timeslot: BigInt,
  tokenId: BigInt,
  beta: BigDecimal,
): OutcomeTimeslot {
  const loaded = OutcomeTimeslot.load(id);
  if (loaded == null) {
    const created = new OutcomeTimeslot(id);
    {
      created.outcome = outcomeEntityId;
      created.timeslot = timeslot;
      created.tokenId = tokenId;
      created.beta = beta;
    }
    created.save()
    return created;
  } else {
    {
      assertFieldEqual('OutcomeTimeslot', id, 'outcome', loaded.outcome, outcomeEntityId);
      assertFieldEqual('OutcomeTimeslot', id, 'timeslot', loaded.timeslot, timeslot);
      assertFieldEqual('OutcomeTimeslot', id, 'tokenId', loaded.tokenId, tokenId);
      assertFieldEqual('OutcomeTimeslot', id, 'beta', loaded.beta, beta);
    }
    return loaded;
  }
}

export function assertUserEntity(id: string): User {
  const loaded = User.load(id);
  if (loaded == null) {
    const created = new User(id);
    {
    }
    created.save()
    return created;
  } else {
    {
    }
    return loaded;
  }
}

export function assertUserOutcomeEntity(id: string,
  userEntityId: string,
  outcomeEntityId: string,
): UserOutcome {
  const loaded = UserOutcome.load(id);
  if (loaded == null) {
    const created = new UserOutcome(id);
    {
      created.user = userEntityId;
      created.outcome = outcomeEntityId;
    }
    created.save()
    return created;
  } else {
    {
      assertFieldEqual('UserOutcome', id, 'user', loaded.user, userEntityId);
      assertFieldEqual('UserOutcome', id, 'outcome', loaded.outcome, outcomeEntityId);
    }
    return loaded;
  }
}

export function assertUserOutcomeTimeslotEntity(id: string,
  userEntityId: string,
  outcomeEntityId: string,
  timeslot: BigInt,
  userOutcomeEntityId: string,
  outcomeTimeslotEntityId: string,
): UserOutcomeTimeslot {
  const loaded = UserOutcomeTimeslot.load(id);
  if (loaded == null) {
    const created = new UserOutcomeTimeslot(id);
    {
      created.user = userEntityId;
      created.outcome = outcomeEntityId;
      created.timeslot = timeslot; // ToDo: Deprecate
      created.userOutcome = userOutcomeEntityId;
      created.outcomeTimeslot = outcomeTimeslotEntityId;
    }
    created.save()
    return created;
  } else {
    {
      assertFieldEqual('UserOutcomeTimeslot', id, 'user', loaded.user, userEntityId);
      assertFieldEqual('UserOutcomeTimeslot', id, 'outcome', loaded.outcome, outcomeEntityId);
      assertFieldEqual('UserOutcomeTimeslot', id, 'timeslot', loaded.timeslot, timeslot); // ToDo: Deprecate
      assertFieldEqual('UserOutcomeTimeslot', id, 'userOutcome', loaded.userOutcome, userOutcomeEntityId);
      assertFieldEqual('UserOutcomeTimeslot', id, 'outcomeTimeslot', loaded.outcomeTimeslot, outcomeTimeslotEntityId);
    }
    return loaded;
  }
}
