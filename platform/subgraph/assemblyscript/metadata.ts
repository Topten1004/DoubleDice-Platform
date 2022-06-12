import {
  Address,
  Bytes, log
} from '@graphprotocol/graph-ts';
import {
  VirtualFloorCreationMetadataStruct
} from '../../generated/DoubleDice/DoubleDice';
import {
  GraphHelper,
  GraphHelper__decodeVirtualFloorMetadataV1ResultDecodedStruct
} from '../../generated/DoubleDice/GraphHelper';
import { GRAPH_HELPER_ADDRESS } from '../generated/env';

export function decodeMetadata(wrappedMetadata: VirtualFloorCreationMetadataStruct): GraphHelper__decodeVirtualFloorMetadataV1ResultDecodedStruct {
  if (wrappedMetadata.version == Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000001')) {
    const helper = GraphHelper.bind(Address.fromString(GRAPH_HELPER_ADDRESS));
    return helper.decodeVirtualFloorMetadataV1(wrappedMetadata.data);
  } else {
    log.critical('Metadata version {} not supported', [wrappedMetadata.version.toHex()]);
    throw new Error(`Error: Metadata version ${wrappedMetadata.version.toHex()} not supported`);
  }
}
