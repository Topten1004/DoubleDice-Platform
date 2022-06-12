/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import { BigDecimal, BigInt } from '@graphprotocol/graph-ts';

export const toDecimal = (wei: BigInt): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(18)));

export const paymentTokenAmountToBigDecimal = (wei: BigInt, decimals: i32): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(u8(decimals))));
