import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import {
  BigNumber,
  BigNumberish
} from 'ethers';
import { ethers } from 'hardhat';
import {
  $,
  deployDoubleDice,
  deployDummyUSDCoin,
  ENCODED_DUMMY_METADATA,
  EvmCheckpoint,
  EvmHelper,
  findContractEventArgs,
  findUserCommitmentEventArgs,
  formatUsdc,
  generateRandomVirtualFloorId, sumOf,
  timestampMinuteCeil,
  toFp18,
  tokenIdOf,
  toTimestamp,
  UNSPECIFIED_COMMITMENT_DEADLINE,
  UserCommitment
} from '../helpers';
import {
  DoubleDice, DummyUSDCoin,
  ResolutionState,
  ResultUpdateAction,
  VirtualFloorCreationParamsStruct,
  VirtualFloorState
} from '../lib/contracts';

chai.use(chaiSubset);

describe('DoubleDice', function () {

  let ownerSigner: SignerWithAddress;
  let feeBeneficiarySigner: SignerWithAddress;
  let user1Signer: SignerWithAddress;
  let user2Signer: SignerWithAddress;
  let user3Signer: SignerWithAddress;
  let vfCreatorSigner: SignerWithAddress;
  let noQuotaSigner: SignerWithAddress;
  let contract: DoubleDice;
  let tokenUSDC: DummyUSDCoin;
  let evm: EvmHelper;
  let checkpoint: EvmCheckpoint;

  before(async function () {
    evm = new EvmHelper(ethers.provider);
    checkpoint = await EvmCheckpoint.create(ethers.provider);

    [
      ownerSigner,
      feeBeneficiarySigner,
      user1Signer,
      user2Signer,
      user3Signer,
      vfCreatorSigner,
      noQuotaSigner
    ] = await ethers.getSigners();

    tokenUSDC = await deployDummyUSDCoin(ownerSigner);

    contract = await deployDoubleDice({
      deployer: ownerSigner,
      deployArgs: [],
      initializeArgs: [
        {
          tokenMetadataUriTemplate: 'http://localhost:8080/token/{id}',
          platformFeeRate_e18: toFp18(0.25),
          platformFeeBeneficiary: feeBeneficiarySigner.address,
          contractURI: 'http://localhost:8080/contract-metadata.json'
        },
        tokenUSDC.address,
      ]
    });

    expect(await contract.platformFeeBeneficiary()).to.eq(feeBeneficiarySigner.address);

    {
      expect(await contract.isPaymentTokenWhitelisted(tokenUSDC.address)).to.be.false;
      const { events } = await (await contract.connect(ownerSigner).updatePaymentTokenWhitelist(tokenUSDC.address, true)).wait();
      expect(events).to.have.lengthOf(1);
      expect(findContractEventArgs(events, 'PaymentTokenWhitelistUpdate')).to.containSubset({
        token: tokenUSDC.address,
        whitelisted: true
      });
      expect(await contract.isPaymentTokenWhitelisted(tokenUSDC.address)).to.be.true;
    }

    // Mint 1000$ to each user
    await (await tokenUSDC.connect(ownerSigner).mint(user1Signer.address, $(1000))).wait();
    await (await tokenUSDC.connect(ownerSigner).mint(user2Signer.address, $(1000))).wait();
    await (await tokenUSDC.connect(ownerSigner).mint(user3Signer.address, $(1000))).wait();
    await (await tokenUSDC.connect(ownerSigner).mint(vfCreatorSigner.address, $(1000))).wait();

    // Allow the contract to transfer up to 100$ from each user
    await (await tokenUSDC.connect(user1Signer).approve(contract.address, $(100))).wait();
    await (await tokenUSDC.connect(user2Signer).approve(contract.address, $(100))).wait();
    await (await tokenUSDC.connect(user3Signer).approve(contract.address, $(400))).wait();
    await (await tokenUSDC.connect(vfCreatorSigner).approve(contract.address, $(100))).wait();

    const virtualFloorId = 0x123450000000000n; // lower 5 bytes must be all 00
    const betaOpen = BigNumber.from(10).pow(18).mul(13); // 1 unit per hour
    const creationFeeRate = BigNumber.from(10).pow(18).mul(15).div(1000); // 1.5%
    const tOpen = toTimestamp('2032-01-01T00:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;

    {
      await (await contract.adjustCreationQuotas([{ creator: ownerSigner.address, relativeAmount: 1 }])).wait();
    }

    {
      await (await contract.adjustCreationQuotas([{ creator: vfCreatorSigner.address, relativeAmount: 1000 }])).wait();
    }

    const allUserCommitments: UserCommitment[] = [];

    {
      await evm.setNextBlockTimestamp('2032-01-01T00:00:00');

      const {
        events,
        blockHash
      } = await (await contract.createVirtualFloor({
        virtualFloorId,
        betaOpen_e18: betaOpen,
        creationFeeRate_e18: creationFeeRate,
        tOpen,
        tClose,
        tResolve,
        nOutcomes,
        paymentToken: tokenUSDC.address,
        bonusAmount: 0,
        optionalMinCommitmentAmount: 0,
        optionalMaxCommitmentAmount: 0,
        metadata: ENCODED_DUMMY_METADATA
      })).wait();
      const { timestamp } = await ethers.provider.getBlock(blockHash);
      expect(timestamp).to.eq(toTimestamp('2032-01-01T00:00:00'));

      const vfCreatedEventArgs = findContractEventArgs(events, 'VirtualFloorCreation');
      expect(vfCreatedEventArgs.virtualFloorId).to.eq(virtualFloorId);
    }

    const contractBalanceBeforeCommitments = await tokenUSDC.balanceOf(contract.address);

    {
      const outcomeIndex = 0;
      const amount = $(10);

      await evm.setNextBlockTimestamp('2032-01-01T01:00:00');

      const { events, blockHash } = await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)).wait();

      const vfCommitmentArgs = findUserCommitmentEventArgs(events);
      allUserCommitments.push(vfCommitmentArgs);

      const token1155TransferArgs = findContractEventArgs(events, 'TransferSingle');

      expect(token1155TransferArgs.from).to.eq('0x0000000000000000000000000000000000000000');
      expect(token1155TransferArgs.to).to.eq(user1Signer.address);
      expect(token1155TransferArgs.value).to.eq(amount);

      const nftId = token1155TransferArgs.id;
      // console.log(`nftId = ${nftId}`)

      expect(vfCommitmentArgs.virtualFloorId).to.eq(virtualFloorId);
      expect(vfCommitmentArgs.outcomeIndex).to.eq(outcomeIndex);
      expect(vfCommitmentArgs.amount).to.eq(amount);
      expect(vfCommitmentArgs.tokenId).to.eq(nftId);
      expect(vfCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T01:00:00'));

      expect((await ethers.provider.getBlock(blockHash)).timestamp).to.eq(toTimestamp('2032-01-01T01:00:00'));

    }


    await evm.setNextBlockTimestamp('2032-01-01T02:00:00');
    {
      const { events } = await (await contract.connect(user2Signer).commitToVirtualFloor(virtualFloorId, 1, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T02:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 1, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T02:00:01'));
      allUserCommitments.push(userCommitmentArgs);
    }

    await evm.setNextBlockTimestamp('2032-01-01T06:00:00');
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 1, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T06:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T06:00:01'));
      allUserCommitments.push(userCommitmentArgs);
    }

    await evm.setNextBlockTimestamp('2032-01-01T10:00:00');
    {
      const { events } = await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
      const userCommitmentArgs = findUserCommitmentEventArgs(events);
      expect(userCommitmentArgs.timeslot).to.eq(toTimestamp('2032-01-01T10:00:00'));
      allUserCommitments.push(userCommitmentArgs);
    }

    interface OutcomeTotals {
      amount: BigNumber;
      amountTimesBeta_e18: BigNumber;
    }

    const outcomeTotals: OutcomeTotals[] = await Promise.all([
      contract.getVirtualFloorOutcomeTotals(virtualFloorId, 0),
      contract.getVirtualFloorOutcomeTotals(virtualFloorId, 1),
      contract.getVirtualFloorOutcomeTotals(virtualFloorId, 2),
    ]);

    const betaAt = (datetime: string) => {
      const betaClose = BigNumber.from(10).pow(18);
      const dB = betaOpen.sub(betaClose);
      const dT = BigNumber.from(tClose).sub(tOpen);
      const dt = BigNumber.from(tClose).sub(toTimestamp(datetime));
      const db = dB.mul(dt).div(dT);
      return betaClose.add(db);
    };

    expect(outcomeTotals[0].amount).to.eq(sumOf(
      $(10)
    ));
    expect(outcomeTotals[0].amountTimesBeta_e18).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T01:00:00'))
    ));

    expect(outcomeTotals[1].amount).to.eq(sumOf(
      $(10),
      $(10),
      $(10),
    ));
    expect(outcomeTotals[1].amountTimesBeta_e18).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T02:00:00')),
      $(10).mul(betaAt('2032-01-01T02:00:01')),
      $(10).mul(betaAt('2032-01-01T06:00:00')),
    ));

    expect(outcomeTotals[2].amount).to.eq(sumOf(
      $(10),
      $(10),
    ));
    expect(outcomeTotals[2].amountTimesBeta_e18).to.eq(sumOf(
      $(10).mul(betaAt('2032-01-01T06:00:01')),
      $(10).mul(betaAt('2032-01-01T10:00:00')),
    ));

    // await evm.setNextBlockTimestamp('2032-01-01T23:59:59')
    // expect(contract.resolve(vfId, 1)).to.be.revertedWith('TOO_EARLY_TO_RESOLVE')

    await evm.setNextBlockTimestamp(tClose);

    // user3 gives user2 5$ worth of commitment made at 2032-01-01T02:00:01
    await (await contract.connect(user3Signer).safeTransferFrom(
      user3Signer.address,
      user2Signer.address,
      tokenIdOf({ vfId: virtualFloorId, outcomeIndex: 1, timeslot: toTimestamp('2032-01-01T02:00:01') }),
      $(5),
      '0x'
    )).wait();

    await evm.setNextBlockTimestamp('2032-01-02T00:00:00');
    {
      const { events } = await (await contract.setResult(virtualFloorId, 1)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      expect(vfId).to.eq(virtualFloorId);
      expect(operator).to.eq(ownerSigner.address);
      expect(action).to.eq(ResultUpdateAction.CreatorSetResult);
      expect(outcomeIndex).to.eq(1);
    }

    await evm.setNextBlockTimestamp('2032-01-02T01:30:00');
    {
      const { events } = await (await contract.confirmUnchallengedResult(virtualFloorId)).wait();
      {
        const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
        expect(vfId).to.eq(virtualFloorId);
        expect(operator).to.eq(ownerSigner.address);
        expect(action).to.eq(ResultUpdateAction.SomeoneConfirmedUnchallengedResult);
        expect(outcomeIndex).to.eq(1);
      }

      {
        const { state: resolutionState } = await contract.resolutions(virtualFloorId);
        expect(resolutionState).to.eq(ResolutionState.Complete);
      }

      {
        const { winnerProfits, platformFeeAmount, creatorFeeAmount } = findContractEventArgs(events, 'VirtualFloorResolution');

        const tcf = sumOf(...outcomeTotals.map(({ amount }) => amount));

        let i = 0;
        for (const { amount } of outcomeTotals) {
          console.log(`amount[${i++}] = ${formatUsdc(amount)}`);
        }

        console.log(`tcf               = ${formatUsdc(tcf)}`);
        console.log(`winnerProfits     = ${formatUsdc(winnerProfits)}`);
        console.log(`platformFeeAmount = ${formatUsdc(platformFeeAmount)}`);
        console.log(`creatorFeeAmount  = ${formatUsdc(creatorFeeAmount)}`);

        const allCommitmentBalanceIds = allUserCommitments.map(({ tokenId }) => tokenId);
        console.log(`allCommitmentBalanceIds = ${allCommitmentBalanceIds}`);

        const contractBalanceBeforeTx1 = await tokenUSDC.balanceOf(contract.address);
        let contractBalanceAfterTx1: BigNumber;
        let contractBalanceAfterTx2: BigNumber;
        let contractBalanceAfterTx3: BigNumber;

        {
          const { events } = await (await contract.connect(user1Signer).claimPayouts(virtualFloorId, allCommitmentBalanceIds)).wait();
          contractBalanceAfterTx1 = await tokenUSDC.balanceOf(contract.address);
          const transferBatch = findContractEventArgs(events, 'TransferBatch');
          const [, , , ids, amounts] = transferBatch;
          // console.log({ ids, amounts });
        }

        {
          const { events } = await (await contract.connect(user2Signer).claimPayouts(virtualFloorId, allCommitmentBalanceIds)).wait();
          contractBalanceAfterTx2 = await tokenUSDC.balanceOf(contract.address);
          const transferBatch = findContractEventArgs(events, 'TransferBatch');
          const [, , , ids, amounts] = transferBatch;
          // console.log({ ids, amounts });
        }

        {
          const { events } = await (await contract.connect(user3Signer).claimPayouts(virtualFloorId, allCommitmentBalanceIds)).wait();
          contractBalanceAfterTx3 = await tokenUSDC.balanceOf(contract.address);
          const transferBatch = findContractEventArgs(events, 'TransferBatch');
          const [, , , ids, amounts] = transferBatch;
          // console.log({ ids, amounts });
        }

        console.log(`contract balance before commitments = ${formatUsdc(contractBalanceBeforeCommitments)}`);
        console.log(`contract balance after transfer 1   = ${formatUsdc(contractBalanceAfterTx1)}`);
        console.log(`contract balance after transfer 2   = ${formatUsdc(contractBalanceAfterTx2)}`);
        console.log(`contract balance after transfer 3   = ${formatUsdc(contractBalanceAfterTx3)}`);

        expect(contractBalanceAfterTx1).to.eq(contractBalanceBeforeTx1);
        expect(contractBalanceAfterTx3).to.eq(1);
      }
    }
  });

  describe('Create Virtual Floor', function () {
    const virtualFloorId = generateRandomVirtualFloorId();
    const tOpen = toTimestamp('2032-01-01T12:00:00');
    const tClose = toTimestamp('2033-01-01T12:00:00');
    const tResolve = toTimestamp('2033-01-02T00:00:00');
    const nOutcomes = 3;
    const bonusAmount = 0;
    const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

    const virtualFloorCreationParams: VirtualFloorCreationParamsStruct = {
      virtualFloorId,
      betaOpen_e18,
      creationFeeRate_e18,
      tOpen,
      tClose,
      tResolve,
      nOutcomes,
      paymentToken: '',
      bonusAmount,
      optionalMinCommitmentAmount: 0,
      optionalMaxCommitmentAmount: 0,
      metadata: ENCODED_DUMMY_METADATA,
    };

    it('Should revert if time closure for vpf used in the past', async function () {
      const pastTOpenTime = toTimestamp('2020-01-01T11:00:00');
      const pastClosureTime = toTimestamp('2021-01-01T12:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tOpen: pastTOpenTime,
          tClose: pastClosureTime,
          paymentToken: tokenUSDC.address,
        })
      ).to.be.revertedWith('TooLate()');
    });

    it('Should revert if resolve time used in the past', async function () {
      const pastResolveTime = toTimestamp('2021-01-01T12:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tResolve: pastResolveTime,
          paymentToken: tokenUSDC.address,
        })
      ).to.be.revertedWith('InvalidTimeline()');
    });

    it('Should revert if closure time is later than resolve time', async function () {
      const greaterThanResolveTime = toTimestamp('2034-01-03T00:00:00');
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          tClose: greaterThanResolveTime,
          paymentToken: tokenUSDC.address,
        })
      ).to.be.revertedWith('InvalidTimeline()');
    });

    it('Should revert if outcome provided is less than 2', async function () {
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          nOutcomes: 1,
          paymentToken: tokenUSDC.address,
        })
      ).to.be.revertedWith('NotEnoughOutcomes()');
    });

    it('Should revert if betaOpen is greater than 1e18', async function () {
      const betaOpenGreaterThan1e18 = BigNumber.from(1).pow(19);

      const _virtualFloorId = generateRandomVirtualFloorId();

      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: _virtualFloorId,
          betaOpen_e18: betaOpenGreaterThan1e18,
          paymentToken: tokenUSDC.address,
        })
      ).to.be.revertedWith('BetaOpenTooSmall()');
    });

    it('Should revert when beta is equal to 1e18', async function () {
      const betaOpenGreaterThan1e18 = BigNumber.from(1).pow(18);
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          betaOpen_e18: betaOpenGreaterThan1e18,
          paymentToken: tokenUSDC.address,
        })
      ).to.be.revertedWith('BetaOpenTooSmall()');
    });

    it('Should revert when payment address is not whitelisted', async function () {
      const paymentToken = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
      await expect(
        contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken,
        })
      ).to.be.revertedWith('PaymentTokenNotWhitelisted()');
    });

    it('Should create VF if right arguments passed', async function () {
      const { events } = await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: tokenUSDC.address,
        })
      ).wait();

      const virtualFloorCreationEventArgs = findContractEventArgs(
        events,
        'VirtualFloorCreation'
      );

      expect(virtualFloorCreationEventArgs.virtualFloorId).to.eq(
        BigNumber.from(virtualFloorCreationParams.virtualFloorId)
      );
    });

    it('Should revert because VF creation quota is exceeded', async function () {
      const _virtualFloorId = generateRandomVirtualFloorId();

      const params: VirtualFloorCreationParamsStruct = {
        ...virtualFloorCreationParams,
        virtualFloorId: _virtualFloorId,
        paymentToken: tokenUSDC.address,
      };
      await expect(contract.connect(noQuotaSigner).createVirtualFloor(params)).to.be.reverted;
    });

    it('Should revert if VF with same id created before', async function () {
      {
        await (await contract.adjustCreationQuotas([{ creator: ownerSigner.address, relativeAmount: 2 }])).wait();
      }
      const params: VirtualFloorCreationParamsStruct = {
        ...virtualFloorCreationParams,
        paymentToken: tokenUSDC.address,
      };

      await expect(contract.createVirtualFloor(params)).to.be.revertedWith('DuplicateVirtualFloorId()');
    });
  });

  describe('Commit To Virtual Floor', function () {
    // Random virtual floor for each test case
    let virtualFloorId: BigNumberish;
    const tOpen = toTimestamp('2032-01-01T12:00:00');
    const tClose = toTimestamp('2033-01-01T12:00:00');
    const tResolve = toTimestamp('2033-01-10T00:00:00');
    const nOutcomes = 3;
    const bonusAmount = 0;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour


    const $ = (dollars: BigNumberish, millionths: BigNumberish = 0): BigNumber =>
      BigNumber.from(1000000)
        .mul(dollars)
        .add(millionths);

    const outcomeIndex = 0;
    const amount = $(10);
    const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

    let virtualFloorCreationParams: VirtualFloorCreationParamsStruct;

    beforeEach(async () => {
      virtualFloorId = generateRandomVirtualFloorId();

      virtualFloorCreationParams = {
        virtualFloorId,
        betaOpen_e18,
        creationFeeRate_e18,
        tOpen,
        tClose,
        tResolve,
        nOutcomes,
        paymentToken: tokenUSDC.address,
        bonusAmount,
        optionalMinCommitmentAmount: 0,
        optionalMaxCommitmentAmount: 0,
        metadata: ENCODED_DUMMY_METADATA,
      };

      await (
        await contract.connect(vfCreatorSigner).createVirtualFloor(virtualFloorCreationParams)
      ).wait();
    });

    it('Should revert if virtualFloorId doesn’t exist', async function () {
      const randomVirtualFloorId = '0x00000000000000000000000000000000000000000000000000dead0000000000';
      const outcomeIndex = 0;
      const amount = $(10);

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(randomVirtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.None})`);
    });

    it('Should revert if virtual Floor is closed', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp('2033-01-02T13:00:00');

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.Active_Closed_ResolvableNever})`);
      await checkpoint.revertTo();
    });

    it('Should revert if outcome index provided is out of options set for VF', async function () {
      const wrongOutComeIndex = 3;
      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, wrongOutComeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).to.be.revertedWith('OutcomeIndexOutOfRange()');
    });

    it('Should revert if amount is zero', async function () {
      const wrongAmount = $(0);
      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, wrongAmount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).to.be.revertedWith('CommitmentAmountOutOfRange()');
    });

    it('Should revert if enough allowance was not granted', async function () {
      const amountBiggerThanAllowance = $(200);
      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(
            virtualFloorId,
            outcomeIndex,
            amountBiggerThanAllowance,
            UNSPECIFIED_COMMITMENT_DEADLINE
          )
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('Should commit successfully if right parameters passed and as well emit right event with right parameters', async function () {
      const { events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();

      const userCommitmentEventArgs = findUserCommitmentEventArgs(events);

      expect(userCommitmentEventArgs.virtualFloorId).to.eq(virtualFloorId);
      expect(userCommitmentEventArgs.outcomeIndex).to.eq(outcomeIndex);
      expect(userCommitmentEventArgs.amount).to.eq(amount);
    });

    it('Should transfer the amount to the contract address', async function () {
      const balanceOfContractBeforeCommit = await tokenUSDC.balanceOf(
        contract.address
      );
      await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const balanceOfContractAfterCommit = await tokenUSDC.balanceOf(
        contract.address
      );
      expect(
        balanceOfContractAfterCommit.sub(balanceOfContractBeforeCommit)
      ).to.be.eq(amount);
    });

    it('Should generate unique token id for the granularity level of time slot duration after open time', async function () {
      const virtualFloorId1 = generateRandomVirtualFloorId();

      const { timestamp } = await ethers.provider.getBlock('latest');

      const _tOpen = timestampMinuteCeil(timestamp + 60);
      const tCommitment1 = timestampMinuteCeil(_tOpen + 3 * 60);
      const tCommitment2 = timestampMinuteCeil(_tOpen + 6 * 60);

      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: virtualFloorId1,
          tOpen: _tOpen,
          paymentToken: tokenUSDC.address,
        })
      ).wait();


      await evm.setNextBlockTimestamp(tCommitment1);

      const { events: commitment1Events, blockHash: blockHash1 } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId1, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const commitment1EventArgs = findUserCommitmentEventArgs(
        commitment1Events
      );

      expect((await ethers.provider.getBlock(blockHash1)).timestamp).to.eq(tCommitment1);


      await evm.setNextBlockTimestamp(tCommitment2);

      const { events: commitment2Events, blockHash: blockHash2 } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId1, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const commitment2EventArgs = findUserCommitmentEventArgs(
        commitment2Events
      );

      expect((await ethers.provider.getBlock(blockHash2)).timestamp).to.eq(tCommitment2);


      expect(commitment2EventArgs.tokenId).to.be.not.eq(
        commitment1EventArgs.tokenId
      );
    });

    it('Should revert if the amount passed is more than the limit uint256', async function () {
      const amountExceedUint256Limit = 2n ** 256n + 1n;

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(
            virtualFloorId,
            outcomeIndex,
            amountExceedUint256Limit,
            UNSPECIFIED_COMMITMENT_DEADLINE
          )
      ).to.be.reverted;
    });

    it('Should revert if the weighted amount passed the max limit of uint256', async function () {
      const amountExceedUint256Limit = 2n ** 256n;

      await expect(
        contract
          .connect(user1Signer)
          .commitToVirtualFloor(
            virtualFloorId,
            outcomeIndex,
            amountExceedUint256Limit,
            UNSPECIFIED_COMMITMENT_DEADLINE
          )
      ).to.be.reverted;
    });

    it('Should mint token commitment for the user', async function () {
      const { events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const userCommitmentEventArgs = findUserCommitmentEventArgs(events);

      const mintedTokenAmount = await contract.balanceOf(
        user1Signer.address,
        userCommitmentEventArgs.tokenId
      );
      expect(mintedTokenAmount).to.be.eq(amount);
    });
  });

  describe('Resolve Virtual Floor', function () {
    // Random virtual floor for each test case
    const virtualFloorId = generateRandomVirtualFloorId();
    const virtualFloorId2 = generateRandomVirtualFloorId();
    const virtualFloorId3 = generateRandomVirtualFloorId();
    const tOpen = toTimestamp('2032-01-01T12:00:00');
    const tClose = toTimestamp('2033-01-01T12:00:00');
    const tResolve = toTimestamp('2033-01-10T00:00:00');
    const nOutcomes = 3;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

    before(async () => {


      const virtualFloorCreationParams: VirtualFloorCreationParamsStruct = {
        virtualFloorId,
        tOpen,
        tClose,
        tResolve,
        nOutcomes,
        betaOpen_e18,
        creationFeeRate_e18: 50000_000000_000000n, // 0.05 = 5%,
        bonusAmount: 0,
        optionalMinCommitmentAmount: 0,
        optionalMaxCommitmentAmount: 0,
        paymentToken: tokenUSDC.address,
        metadata: ENCODED_DUMMY_METADATA,
      };
      await (
        await contract.connect(vfCreatorSigner).createVirtualFloor(virtualFloorCreationParams)
      ).wait();
      await (
        await contract.connect(vfCreatorSigner).createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: virtualFloorId2,
        })
      ).wait();
      await (
        await contract.connect(vfCreatorSigner).createVirtualFloor({
          ...virtualFloorCreationParams,
          virtualFloorId: virtualFloorId3,
        })
      ).wait();
      {
        await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId, 1, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
        await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId, 2, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
        await (await contract.connect(user2Signer).commitToVirtualFloor(virtualFloorId2, 1, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
        await (await contract.connect(user3Signer).commitToVirtualFloor(virtualFloorId2, 2, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
        await (await contract.connect(user1Signer).commitToVirtualFloor(virtualFloorId3, 1, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();
        await (await contract.connect(user2Signer).commitToVirtualFloor(virtualFloorId3, 2, $(10), UNSPECIFIED_COMMITMENT_DEADLINE)).wait();

      }
    });

    it('Should revert if VF / market does not exist', async function () {
      const wrongVirtualFloorId = '0x00000000000000000000000000000000000000000000000000dead0000000000';
      await expect(contract.connect(vfCreatorSigner).setResult(wrongVirtualFloorId, 1)).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.None})`);
    });

    it('Should revert if resolve time has not reached', async function () {
      await expect(contract.connect(vfCreatorSigner).setResult(virtualFloorId, 0)).to.be.revertedWith(`WrongVirtualFloorState(${VirtualFloorState.Active_Open_ResolvableLater})`);
    });

    it('Should set the VF result correctly with outcomes', async function () {
      await evm.setNextBlockTimestamp('2033-01-10T00:10:00');

      const { events } = await (await contract.connect(vfCreatorSigner).setResult(virtualFloorId, 1)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      expect(vfId).to.eq(virtualFloorId);
      expect(operator).to.eq(vfCreatorSigner.address);
      expect(action).to.eq(ResultUpdateAction.CreatorSetResult);
      expect(outcomeIndex).to.eq(1);
    });

    it('Should revert if you try to confrim challenge before 1 hour is over', async function () {
      await expect(contract.connect(user1Signer).confirmUnchallengedResult(virtualFloorId)).to.be.revertedWith('TooEarly()');
    });

    it('Should revert if you try to challenge a set result when it is too late', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await (await contract.connect(vfCreatorSigner).setResult(virtualFloorId3, 1)).wait();
      await evm.setNextBlockTimestamp('2033-01-12T01:10:00');

      await expect(contract.connect(user1Signer).challengeSetResult(virtualFloorId3, 2)).to.be.revertedWith('TooLate()');
      await checkpoint.revertTo();
    });


    it('Should challenge a set result', async function () {

      await (await contract.connect(vfCreatorSigner).setResult(virtualFloorId2, 1)).wait();
      await evm.setNextBlockTimestamp('2033-01-10T01:10:00');
      const challengerBalanceBeforeResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const { events } = await (await contract.connect(user3Signer).challengeSetResult(virtualFloorId2, 2)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      const challengerBalanceAfterResolution = await tokenUSDC.balanceOf(user3Signer.address);
      expect(vfId).to.eq(virtualFloorId2);
      expect(operator).to.eq(user3Signer.address);
      expect(action).to.eq(ResultUpdateAction.SomeoneChallengedSetResult);
      expect(outcomeIndex).to.eq(2);
      expect(challengerBalanceAfterResolution).to.be.lt(challengerBalanceBeforeResolution);
    });

    it('Confirm unchallenged result by anyone after 1 hour', async function () {
      await evm.setNextBlockTimestamp('2033-01-10T01:11:00');
      const { events } = await (await contract.connect(user1Signer).confirmUnchallengedResult(virtualFloorId)).wait();

      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      expect(vfId).to.eq(virtualFloorId);
      expect(operator).to.eq(user1Signer.address);
      expect(action).to.eq(ResultUpdateAction.SomeoneConfirmedUnchallengedResult);
      expect(outcomeIndex).to.eq(1);
    });

    it('Should revert if vf creator tries to finalize result', async function () {
      const OPERATOR_ROLE = await contract.OPERATOR_ROLE();
      await expect(contract.connect(vfCreatorSigner).finalizeChallenge(virtualFloorId2, 2)).to.be.revertedWith(`AccessControl: account ${vfCreatorSigner.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`);
    });

    it('Should finalize set result to favor challenger', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp('2033-01-11T00:00:00');
      const challengerBalanceBeforeResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const VFCreatorBalanceBeforeResolution = await tokenUSDC.balanceOf(vfCreatorSigner.address);
      const { events } = await (await contract.connect(ownerSigner).finalizeChallenge(virtualFloorId2, 2)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      const challengerBalanceAfterResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const VFCreatorBalanceAfterResolution = await tokenUSDC.balanceOf(vfCreatorSigner.address);
      expect(vfId).to.eq(virtualFloorId2);
      expect(operator).to.eq(ownerSigner.address);
      expect(action).to.eq(ResultUpdateAction.AdminFinalizedChallenge);
      expect(outcomeIndex).to.eq(2);
      expect(challengerBalanceAfterResolution).to.be.gt(challengerBalanceBeforeResolution);
      expect(VFCreatorBalanceAfterResolution).to.eq(VFCreatorBalanceBeforeResolution);
      await checkpoint.revertTo();
    });

    it('Should finalize set result to favor vf creator', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp('2033-01-11T00:00:00');
      const challengerBalanceBeforeResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const VFCreatorBalanceBeforeResolution = await tokenUSDC.balanceOf(vfCreatorSigner.address);
      const { events } = await (await contract.connect(ownerSigner).finalizeChallenge(virtualFloorId2, 1)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      const challengerBalanceAfterResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const VFCreatorBalanceAfterResolution = await tokenUSDC.balanceOf(vfCreatorSigner.address);
      expect(vfId).to.eq(virtualFloorId2);
      expect(operator).to.eq(ownerSigner.address);
      expect(action).to.eq(ResultUpdateAction.AdminFinalizedChallenge);
      expect(outcomeIndex).to.eq(1);
      expect(challengerBalanceBeforeResolution).to.eq(challengerBalanceAfterResolution);
      expect(VFCreatorBalanceAfterResolution).to.be.gt(VFCreatorBalanceBeforeResolution);
      await checkpoint.revertTo();
    });

    it('Should finalize set result to favor no one', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp('2033-01-11T00:00:00');
      const challengerBalanceBeforeResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const VFCreatorBalanceBeforeResolution = await tokenUSDC.balanceOf(vfCreatorSigner.address);
      const { events } = await (await contract.connect(ownerSigner).finalizeChallenge(virtualFloorId2, 0)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      const challengerBalanceAfterResolution = await tokenUSDC.balanceOf(user3Signer.address);
      const VFCreatorBalanceAfterResolution = await tokenUSDC.balanceOf(vfCreatorSigner.address);
      expect(vfId).to.eq(virtualFloorId2);
      expect(operator).to.eq(ownerSigner.address);
      expect(action).to.eq(ResultUpdateAction.AdminFinalizedChallenge);
      expect(outcomeIndex).to.eq(0);
      expect(challengerBalanceBeforeResolution).to.eq(challengerBalanceAfterResolution);
      expect(VFCreatorBalanceAfterResolution).to.eq(VFCreatorBalanceBeforeResolution);
      await checkpoint.revertTo();
    });

    it('Should let platform admin set result that was not set by vf owner', async function () {
      const checkpoint = await EvmCheckpoint.create();
      await evm.setNextBlockTimestamp('2033-01-12T01:10:00');
      const { events } = await (await contract.connect(ownerSigner).finalizeUnsetResult(virtualFloorId3, 2)).wait();
      const { vfId, operator, action, outcomeIndex } = findContractEventArgs(events, 'ResultUpdate');
      expect(vfId).to.eq(virtualFloorId3);
      expect(operator).to.eq(ownerSigner.address);
      expect(action).to.eq(ResultUpdateAction.AdminFinalizedUnsetResult);
      expect(outcomeIndex).to.eq(2);
      await checkpoint.revertTo();
    });
  });

  after(async () => {
    await checkpoint.revertTo();
  });

});
