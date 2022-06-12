export * from './generated/typechain-types';
export * from './generated/typechain-types/IDoubleDice';
export * from './helpers/sol-enums';
export type {
  VirtualFloorMetadataV1Struct,
  VirtualFloorMetadataV1Struct as RoomEventInfo,
};

import { BytesLike, ethers } from 'ethers';
import { Result } from 'ethers/lib/utils';
import { DoubleDice__factory, GraphHelper__factory } from './generated/typechain-types';
import { VirtualFloorMetadataV1Struct } from './generated/typechain-types/GraphHelper';
import { EncodedVirtualFloorMetadataStruct } from './generated/typechain-types/IDoubleDice';

export const encodeVirtualFloorMetadata = (metadata: VirtualFloorMetadataV1Struct): EncodedVirtualFloorMetadataStruct => {
  const encodedWithSelector = GraphHelper__factory.createInterface().encodeFunctionData('encodeVirtualFloorMetadataV1', [metadata]);
  const encoded = ethers.utils.hexDataSlice(encodedWithSelector, 4);
  return {
    version: ethers.utils.hexZeroPad('0x01', 32),
    data: encoded
  };
};

type DecodedDoubleDiceCustomErrorData = {
  name: string;
  formattedArgs: string;
}

export const decodeDoubleDiceCustomErrorData = (encodedErrorData: BytesLike): DecodedDoubleDiceCustomErrorData | null => {
  const doubleDiceInterface = DoubleDice__factory.createInterface();
  for (const errorFragment of Object.values(doubleDiceInterface.errors)) {
    let result: Result;
    try {
      result = doubleDiceInterface.decodeErrorResult(errorFragment, encodedErrorData);
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if ('reason' in e && /^data signature does not match error/.test(e.reason)) {
        continue;
      } else {
        return null;
      }
    }
    const formattedArgs = Object.entries(result)
      .filter(([name]) => !/^\d+$/.test(name)) // filter out numeric keys
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return {
      name: errorFragment.name,
      formattedArgs,
    };
  }
  return null;
};
