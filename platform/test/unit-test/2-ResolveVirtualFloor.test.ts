import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  $,
  deployDoubleDice,
  deployDummyUSDCoin,
  DoubleDicePlatformHelper,
  ENCODED_DUMMY_METADATA,
  EvmCheckpoint,
  EvmHelper,
  generateRandomVirtualFloorId, SignerWithAddress,
  toFp18,
  toTimestamp,
  UNSPECIFIED_COMMITMENT_DEADLINE,
  UserCommitment
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct,
  VirtualFloorState
} from '../../lib/contracts';

chai.use(chaiSubset);

let helper: DoubleDicePlatformHelper;

const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

describe('DoubleDice/Resolve', function () {
  let ownerSigner: SignerWithAddress;
  let platformFeeBeneficiarySigner: SignerWithAddress;
  let user1Signer: SignerWithAddress;
  let user2Signer: SignerWithAddress;
  let user3Signer: SignerWithAddress;
  let user4Signer: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyUSDCoin | DummyWrappedBTC;
  let paymentTokenAddress: string;
  let evm: EvmHelper;

  before(async function () {
    evm = new EvmHelper(ethers.provider);

    [
      ownerSigner,
      platformFeeBeneficiarySigner,
      user1Signer,
      user2Signer,
      user3Signer,
      user4Signer,
    ] = await ethers.getSigners();

    // Deploy USDC Token
    token = await new DummyUSDCoin__factory(ownerSigner).deploy();
    token = await deployDummyUSDCoin(ownerSigner);

    contract = await deployDoubleDice({
      deployer: ownerSigner,
      deployArgs: [],
      initializeArgs: [
        {
          tokenMetadataUriTemplate: 'http://localhost:8080/token/{id}',
          platformFeeRate_e18: toFp18(0.50), // 50%
          platformFeeBeneficiary: platformFeeBeneficiarySigner.address,
          contractURI: 'http://localhost:8080/contract-metadata.json'
        },
        token.address,
      ]
    });


    expect(await contract.platformFeeRate_e18()).to.eq(500000_000000_000000n);

    helper = new DoubleDicePlatformHelper(contract);

    // Assert fee beneficiary
    expect(await contract.platformFeeBeneficiary()).to.eq(platformFeeBeneficiarySigner.address);

    {
      expect(
        await contract.isPaymentTokenWhitelisted(token.address)
      ).to.be.false;
      await (
        await contract
          .connect(ownerSigner)
          .updatePaymentTokenWhitelist(token.address, true)
      ).wait();
      expect(
        await contract.isPaymentTokenWhitelisted(token.address)
      ).to.be.true;
      paymentTokenAddress = token.address;
    }
  });

  describe('Resolve Virtual Floor', function () {
    // Random virtual floor for each test case
    const virtualFloorId = generateRandomVirtualFloorId();
    const virtualFloorId2 = generateRandomVirtualFloorId();
    const allWinnersVf = generateRandomVirtualFloorId();
    const tOpen = toTimestamp('2022-06-01T12:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

    let user1CommitmentEventArgs: UserCommitment;
    let user2CommitmentEventArgs: UserCommitment;
    let user3CommitmentEventArgs: UserCommitment;

    const virtualFloorCreationParams: VirtualFloorCreationParamsStruct = {
      virtualFloorId,
      betaOpen_e18,
      creationFeeRate_e18,
      tOpen,
      tClose,
      tResolve,
      nOutcomes,
      paymentToken: paymentTokenAddress,
      bonusAmount: 0,
      optionalMinCommitmentAmount: 0,
      optionalMaxCommitmentAmount: 0,
      metadata: ENCODED_DUMMY_METADATA,
    };

    before(async () => {
      // Mint 1000$ to each user
      await (
        await token.connect(ownerSigner).mint(user1Signer.address, $(1000))
      ).wait();
      await (
        await token.connect(ownerSigner).mint(user2Signer.address, $(1000))
      ).wait();
      await (
        await token.connect(ownerSigner).mint(user3Signer.address, $(1000))
      ).wait();

      // Allow the contract to transfer up to 100$ from each user
      await (
        await token.connect(user1Signer).approve(contract.address, $(100))
      ).wait();
      await (
        await token.connect(user2Signer).approve(contract.address, $(100))
      ).wait();
      await (
        await token.connect(user3Signer).approve(contract.address, $(100))
      ).wait();

      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: paymentTokenAddress,
        })
      ).wait();
      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: virtualFloorId2,
          paymentToken: paymentTokenAddress,
        })
      ).wait();
      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: allWinnersVf,
          paymentToken: paymentTokenAddress,
        })
      ).wait();

      user1CommitmentEventArgs = await helper.commitToVirtualFloor(virtualFloorId, 0, user1Signer, $(10), UNSPECIFIED_COMMITMENT_DEADLINE);
      user2CommitmentEventArgs = await helper.commitToVirtualFloor(virtualFloorId, 1, user2Signer, $(10), UNSPECIFIED_COMMITMENT_DEADLINE);
      user3CommitmentEventArgs = await helper.commitToVirtualFloor(virtualFloorId, 1, user3Signer, $(10), UNSPECIFIED_COMMITMENT_DEADLINE);

      await helper.commitToVirtualFloor(allWinnersVf, 1, user1Signer, $(10), UNSPECIFIED_COMMITMENT_DEADLINE);
      await helper.commitToVirtualFloor(allWinnersVf, 1, user2Signer, $(10), UNSPECIFIED_COMMITMENT_DEADLINE);
      await helper.commitToVirtualFloor(allWinnersVf, 1, user3Signer, $(10), UNSPECIFIED_COMMITMENT_DEADLINE);
    });

    it('Should revert if VF / market does not exist', async function () {
      const inexistentVfId = '0x00000000000000000000000000000000000000000000000000dead0000000000';
      await expect(contract.setResult(inexistentVfId, 1)).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.None})`);
    });

    it('Should revert if resolve time has not reached', async function () {

      // Commit to 2 outcomes so that VF resolution fails because too early,
      // and not because it is unresolvable.
      await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId2, 0, 1, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
      await (await contract.connect(user2Signer).commitToVirtualFloor(virtualFloorId2, 1, 1, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();

      await expect(contract.setResult(virtualFloorId2, 1)).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.Active_Open_ResolvableLater})`);
    });

    it('Should revert if the provided outcome index is out of the VF outcomes', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp(tResolve);
      await expect(contract.setResult(virtualFloorId2, 4)).to.be.revertedWith('OutcomeIndexOutOfRange()');
      await checkpoint.revertTo();
    });

    it('Should revert if VF is already on resolved state', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp(tResolve);

      await helper.setResultThenLaterConfirmUnchallengedResult(ownerSigner, virtualFloorId2, 1);

      await expect(contract.setResult(virtualFloorId2, 1)).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.Claimable_Payouts})`);
      await checkpoint.revertTo();
    });

    it('Should cancel VF and set resolution type to No Winners when total commitments for the resolution index is 0', async function () {
      const checkpoint = await EvmCheckpoint.create();
      const { amount: amount0 } = await contract.getVirtualFloorOutcomeTotals(virtualFloorId, 0);
      expect(amount0).to.be.gt(0);
      const { amount: amount1 } = await contract.getVirtualFloorOutcomeTotals(virtualFloorId, 1);
      expect(amount1).to.be.gt(0);
      const { amount: amount2 } = await contract.getVirtualFloorOutcomeTotals(virtualFloorId, 2);
      expect(amount2).to.be.eq(0);

      await evm.setNextBlockTimestamp(tResolve);
      await helper.setResultThenLaterConfirmUnchallengedResult(ownerSigner, virtualFloorId, 2);

      expect(await contract.getVirtualFloorState(virtualFloorId)).to.be.eq(VirtualFloorState.Claimable_Refunds_ResolvedNoWinners);
      await checkpoint.revertTo();
    });

    it('Should fail with WrongVirtualFloorState(ClosedUnresolvable) when total commits of the VF is equal to winner commitments', async function () {
      const checkpoint = await EvmCheckpoint.create();
      const vfAggregateCommitments = await contract.getVirtualFloorOutcomeTotals(
        allWinnersVf,
        1
      );
      expect(vfAggregateCommitments.amount).to.be.eq($(10).mul(3));

      await evm.setNextBlockTimestamp(tResolve);

      await expect(contract.setResult(allWinnersVf, 1)).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.Active_Closed_ResolvableNever})`);

      await (await contract.cancelVirtualFloorUnresolvable(allWinnersVf)).wait();

      expect(await contract.getVirtualFloorState(allWinnersVf)).to.be.eq(VirtualFloorState.Claimable_Refunds_ResolvableNever);
      await checkpoint.revertTo();
    });

    it(`Should set VF state to completed as well as resolution type to
        some winners and set winnerProfits, transfer to
        the feeBeneficary the fee amount and emit correct event with
        VirtualFloorResolution with right parameters`, async function () {
      const checkpoint = await EvmCheckpoint.create();
      const balanceOfFeeBeneficaryBefore = await token.balanceOf(
        platformFeeBeneficiarySigner.address
      );

      await evm.setNextBlockTimestamp(tResolve);

      const [VFResolutionEventArgs] = await helper.setResultThenLaterConfirmUnchallengedResult(ownerSigner, virtualFloorId, 1);

      const balanceOfFeeBeneficaryAfter = await token.balanceOf(
        platformFeeBeneficiarySigner.address
      );

      expect(await contract.getVirtualFloorState(virtualFloorId)).to.be.eq(VirtualFloorState.Claimable_Payouts);

      expect(balanceOfFeeBeneficaryAfter.toNumber()).to.be.gt(
        balanceOfFeeBeneficaryBefore.toNumber()
      );

      expect(VFResolutionEventArgs.virtualFloorId).to.eq(virtualFloorId);
      expect(VFResolutionEventArgs.winningOutcomeIndex).to.eq(1);

      await checkpoint.revertTo();
    });

  });
});
