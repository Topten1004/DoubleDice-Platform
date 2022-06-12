import { BigNumber } from '@ethersproject/bignumber';
import assert from 'assert';
import { ethers } from 'hardhat';
import { DUMMY_METADATA, UNSPECIFIED_COMMITMENT_DEADLINE } from '../helpers';
import { DoubleDice__factory, DummyUSDCoin__factory, encodeVirtualFloorMetadata } from '../lib/contracts';
import { validateRoomEventInfo } from '../lib/metadata';

const TOKEN_CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const PLATFORM_CONTRACT_ADDRESS = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';

async function main() {

  const roomEventInfo = DUMMY_METADATA;

  assert(validateRoomEventInfo(roomEventInfo));

  const [owner, user1, user2] = await ethers.getSigners();

  console.log(owner.address);

  const platform = new DoubleDice__factory(owner).attach(PLATFORM_CONTRACT_ADDRESS);

  const token = new DummyUSDCoin__factory(owner).attach(TOKEN_CONTRACT_ADDRESS);

  // const { timestamp } = await ethers.provider.getBlock('latest');

  const unroundedTimestamp = Math.floor(Date.now() / 1000);
  const timestamp = unroundedTimestamp - unroundedTimestamp % 60;

  console.log(`timestamp = ${timestamp}`);

  const vfId = BigNumber.from(ethers.utils.hexlify(ethers.utils.randomBytes(8))).shl(5 * 8);
  console.log(`vfId = ${vfId}`);

  const tOpen = timestamp + 0 * 86400;
  const tClose = timestamp + 1 * 86400;
  const tResolve = timestamp + 2 * 86400;

  await (await platform.createVirtualFloor({
    virtualFloorId: vfId,
    betaOpen_e18: 100_000000_000000_000000n, // = 100.0
    creationFeeRate_e18: 12500_000000_000000n, // = 0.0125 = 1.25%
    tOpen,
    tClose,
    tResolve,
    nOutcomes: roomEventInfo.outcomes.length,
    paymentToken: TOKEN_CONTRACT_ADDRESS,
    bonusAmount: 0,
    optionalMinCommitmentAmount: 0,
    optionalMaxCommitmentAmount: 0,
    metadata: encodeVirtualFloorMetadata(DUMMY_METADATA),
  })).wait();

  const amt = 100_000000_000000_000000n;
  await (await token.mint(user1.address, amt)).wait();
  await (await token.mint(user2.address, amt)).wait();

  await (await token.connect(user1).increaseAllowance(platform.address, amt)).wait();
  await (await token.connect(user2).increaseAllowance(platform.address, amt)).wait();

  console.log(`balanceOf(1) = ${await token.balanceOf(user1.address)}`);
  console.log(`balanceOf(2) = ${await token.balanceOf(user2.address)}`);

  const { events: events1 } = await (await platform.connect(user1).commitToVirtualFloor(vfId, 0, 100000_000000_000000n, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
  const { events: events2 } = await (await platform.connect(user1).commitToVirtualFloor(vfId, 1, 200000_000000_000000n, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
  const { events: events3 } = await (await platform.connect(user2).commitToVirtualFloor(vfId, 1, 300000_000000_000000n, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
  const { events: events4 } = await (await platform.connect(user2).commitToVirtualFloor(vfId, 2, 400000_000000_000000n, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();

  const { args: { id: id1 } } = events1!.find(({ event }) => event === 'TransferSingle') as any;
  const { args: { id: id2 } } = events2!.find(({ event }) => event === 'TransferSingle') as any;
  const { args: { id: id3 } } = events3!.find(({ event }) => event === 'TransferSingle') as any;
  const { args: { id: id4 } } = events4!.find(({ event }) => event === 'TransferSingle') as any;

  assert(BigNumber.isBigNumber(id1));
  assert(BigNumber.isBigNumber(id2));

  assert(id2.eq(id3));

  // ToDo: Use evm_setNextBlockTimestamp as soon as we move to hardhat in Docker configuration,
  // or as soon as ganache-cli supports it
  await ethers.provider.send('evm_mine', []);
  const { timestamp: now } = await ethers.provider.getBlock('latest');
  await ethers.provider.send('evm_increaseTime', [tClose - now]);
  await (await platform.connect(user1).safeTransferFrom(user1.address, user2.address, id2, 25000_000000_000000n, '0x')).wait();

  console.log({
    id1: id1.toString(),
    id2: id2.toString(),
    id3: id3.toString(),
    id4: id4.toString(),
  });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
