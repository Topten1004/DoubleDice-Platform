import {
  BigNumber,
  BigNumberish,
  ContractReceipt,
  Signer
} from 'ethers';
import { ethers } from 'hardhat';
import {
  findUserCommitmentEventArgs,
  findVFResolutionEventArgs,
  SignerWithAddress,
  UserCommitment,
  VirtualFloorResolution
} from '.';
import {
  BaseDoubleDice,
  DoubleDice,
  DummyUSDCoin,
  DummyWrappedBTC
} from '../lib/contracts';
import { EvmHelper } from './evm';

type AddressOrSigner = string | SignerWithAddress;

export const toAddress = (addressOrSigner: AddressOrSigner) => typeof addressOrSigner === 'string' ? addressOrSigner : addressOrSigner.address;

// ToDo: Move into Helper class, use provider supplied to its constructor
const evm = new EvmHelper(ethers.provider);

export class DoubleDicePlatformHelper {
  constructor(private contract: DoubleDice) { }

  balanceOf(addressOrSigner: string, tokenId: string): Promise<BigNumber> {
    return this.contract.balanceOf(addressOrSigner, tokenId);
  }

  async mintTokensForUser({
    token,
    ownerSigner,
    userAddress,
    amount,
  }: {
    token: DummyUSDCoin | DummyWrappedBTC;
    ownerSigner: SignerWithAddress;
    userAddress: string;
    amount: BigNumber;
  }) {
    return await (
      await token.connect(ownerSigner).mint(userAddress, amount)
    ).wait();
  }
  async mintTokenAndGiveAllowanceToContract({
    token,
    ownerSigner,
    usersSigner,
    mintAmount,
    allowanceAmount,
    contractAddress,
  }: {
    token: DummyUSDCoin | DummyWrappedBTC;
    ownerSigner: SignerWithAddress;
    usersSigner: SignerWithAddress[];
    mintAmount: BigNumber;
    allowanceAmount: BigNumber;
    contractAddress: string;
  }) {
    for (const userSigner of usersSigner) {
      await (
        await token.connect(userSigner).approve(contractAddress, allowanceAmount)
      ).wait();

      await (
        await token.connect(ownerSigner).mint(toAddress(userSigner), mintAmount)
      ).wait();
    }
  }

  // async createVirtualFloor(
  //   virtualFloorCreationParams: VirtualFloorCreationParamsStruct
  // ) {
  //   return await (
  //     await this.contract.createVirtualFloor(virtualFloorCreationParams)
  //   ).wait();
  // }

  async commitToVirtualFloor(
    virtualFloorId: BigNumberish,
    outcomeIndex: number,
    userSigner: SignerWithAddress,
    amount: BigNumberish,
    deadline: BigNumberish,
  ): Promise<UserCommitment> {
    const { events } = await (
      await this.contract
        .connect(userSigner)
        .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, deadline)
    ).wait();

    return (findUserCommitmentEventArgs(
      events
    ) as unknown) as UserCommitment;
  }

  async resolveVirtualFloor(
    virtualFloorId: BigNumberish,
    outcomeIndex: number,
    ownerSigner: SignerWithAddress
  ): Promise<VirtualFloorResolution> {
    const { events } = await (
      await this.contract
        .connect(ownerSigner)
        .setResult(virtualFloorId, outcomeIndex)
    ).wait();

    return (findVFResolutionEventArgs(
      events
    ) as unknown) as VirtualFloorResolution;
  }

  async setResultThenLaterConfirmUnchallengedResult(signer: Signer, ...[vfId, ...otherArgs]: Parameters<DoubleDice['setResult']>): Promise<[VirtualFloorResolution, ContractReceipt, ContractReceipt]> {
    const rx1 = await (await this.contract.connect(signer).setResult(vfId, ...otherArgs)).wait();

    // ToDo: Contract should store tChallengeMax directly, instead of storing setTimestamp
    const { tResultChallengeMax } = await this.contract.resolutions(vfId);
    const CHALLENGE_WINDOW_DURATION = await this.contract.CHALLENGE_WINDOW_DURATION();
    const tChallengeMax = BigNumber.from(tResultChallengeMax).add(CHALLENGE_WINDOW_DURATION);

    await evm.setNextBlockTimestamp(tChallengeMax);

    const rx2 = await (await this.contract.connect(signer).confirmUnchallengedResult(vfId)).wait();

    const vfResolutionEvent = findVFResolutionEventArgs(rx2.events) as unknown as VirtualFloorResolution;

    return [vfResolutionEvent, rx1, rx2];
  }

  async claimPayouts(userSigner: Signer, ...args: Parameters<BaseDoubleDice['claimPayouts']>): Promise<ContractReceipt> {
    return await (await this.contract.connect(userSigner).claimPayouts(...args)).wait();
  }
}
