/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import { BigInt } from '@graphprotocol/graph-ts';

const ONE_HOUR = BigInt.fromU32(60 * 60);

// ToDo: Emit these values per-VF on VirtualFloorCreation event
export const SET_WINDOW_DURATION = ONE_HOUR;
export const CHALLENGE_WINDOW_DURATION = ONE_HOUR;

/**
 * An entity id used for singleton aggregate entities,
 * inspired by https://github.com/centrehq/usdc-subgraph/blob/master/src/mapping.ts
 */
export const SINGLETON_AGGREGATE_ENTITY_ID = 'singleton';
