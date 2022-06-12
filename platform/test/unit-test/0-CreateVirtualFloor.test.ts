import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
  deployDoubleDice,
  deployDummyUSDCoin,
  DUMMY_METADATA,
  ENCODED_DUMMY_METADATA,
  EvmCheckpoint,
  EvmHelper,
  findContractEventArgs,
  SignerWithAddress,
  toFp18,
  toTimestamp
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyWrappedBTC,
  encodeVirtualFloorMetadata,
  VirtualFloorCreationParamsStruct
} from '../../lib/contracts';

chai.use(chaiSubset);

const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

const MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE = 10 * 60;

describe('DoubleDice/Create', function () {
  let ownerSigner: SignerWithAddress;
  let secondCreator: SignerWithAddress;
  let platformFeeBeneficiarySigner: SignerWithAddress;
  let contract: DoubleDice;
  let token: DummyUSDCoin | DummyWrappedBTC;
  let evm: EvmHelper;
  let checkpoint: EvmCheckpoint;
  const virtualFloorId = '0x0000000000000000000000000000000000000000000000000123450000000000';
  const tOpen = toTimestamp('2032-01-01T00:00:00');
  const tClose = toTimestamp('2032-01-01T12:00:00');
  const tResolve = toTimestamp('2032-01-02T00:00:00');
  const nOutcomes = 3;
  const betaOpen_e18 = BigNumber.from(10)
    .pow(18)
    .mul(13); // 1 unit per hour
  let vfParams: VirtualFloorCreationParamsStruct;

  before(async () => {
    evm = new EvmHelper(ethers.provider);

    [
      ownerSigner,
      platformFeeBeneficiarySigner,
      secondCreator
    ] = await ethers.getSigners();

    // Deploy USDC Token
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
    }

    vfParams = {
      virtualFloorId,
      betaOpen_e18,
      creationFeeRate_e18,
      tOpen,
      tClose,
      tResolve,
      nOutcomes,
      paymentToken: token.address,
      bonusAmount: 0,
      optionalMinCommitmentAmount: 0,
      optionalMaxCommitmentAmount: 0,
      metadata: ENCODED_DUMMY_METADATA,
    };

    checkpoint = await EvmCheckpoint.create();
  });

  describe('tOpen < tClose <= tResolve', () => {
    beforeEach(async () => {
      await evm.setNextBlockTimestamp(tOpen);
    });
    describe('tOpen < tClose', () => {
      it('tClose < tOpen reverts', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tClose: tOpen - 1 })).to.be.revertedWith('InvalidTimeline()');
      });
      it('tClose == tOpen reverts', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tClose: tOpen })).to.be.revertedWith('InvalidTimeline()');
      });
      it('tClose > tOpen succeeds', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tClose: tOpen + 1 })).to.emit(contract, 'VirtualFloorCreation');
      });
    });
    describe('tClose <= tResolve', () => {
      it('tResolve < tClose reverts', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tResolve: tClose - 1 })).to.be.revertedWith('InvalidTimeline()');
      });
      it('tResolve < tClose + MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE reverts', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tResolve: tClose + MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE - 1 })).to.be.revertedWith('InvalidTimeline()');
      });
      it('tResolve == tClose + MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE succeeds', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tResolve: tClose + MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE })).to.emit(contract, 'VirtualFloorCreation');
      });
      it('tResolve > tClose + MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE succeeds', async () => {
        await expect(contract.createVirtualFloor({ ...vfParams, tResolve: tClose + MIN_POSSIBLE_T_RESOLVE_MINUS_T_CLOSE + 1 })).to.emit(contract, 'VirtualFloorCreation');
      });
    });
  });

  it('nOutcomes > 2', async () => {
    await expect(contract.createVirtualFloor({ ...vfParams, nOutcomes: 1 })).to.be.revertedWith('NotEnoughOutcomes()');
    await expect(contract.createVirtualFloor({
      ...vfParams,
      nOutcomes: 2,
      metadata: encodeVirtualFloorMetadata({
        ...DUMMY_METADATA,
        outcomes: DUMMY_METADATA.outcomes.slice(0, 2)
      })
    })).to.emit(contract, 'VirtualFloorCreation');
  });

  it('betaOpen >= 1.0', async () => {
    await expect(contract.createVirtualFloor({ ...vfParams, betaOpen_e18: 999999_999999_999999n })).to.be.revertedWith('BetaOpenTooSmall()');
    await expect(contract.createVirtualFloor({ ...vfParams, betaOpen_e18: 1_000000_000000_000000n })).to.emit(contract, 'VirtualFloorCreation');
  });

  it('creationFeeRate <= 1.0', async () => {
    await expect(contract.createVirtualFloor({ ...vfParams, creationFeeRate_e18: 1_000000_000000_000001n })).to.be.revertedWith('CreationFeeRateTooLarge()');
    await expect(contract.createVirtualFloor({ ...vfParams, creationFeeRate_e18: 1_000000_000000_000000n })).to.emit(contract, 'VirtualFloorCreation');
  });

  it('Creation must happen up to 10% into the Running period', async () => {

    const params = {
      ...vfParams,
      tOpen: toTimestamp('2032-01-30T00:00:00'),
      tClose: toTimestamp('2032-01-30T10:00:00'), // 10 hours later
      tResolve: toTimestamp('2032-01-30T12:00:00')
    };

    const localCheckpoint = await EvmCheckpoint.create();

    const tCreateMax = toTimestamp('2032-01-30T01:00:00');

    evm.setNextBlockTimestamp(tCreateMax + 1);
    await expect(contract.createVirtualFloor(params)).to.be.revertedWith('TooLate()');
    await localCheckpoint.revertTo();

    evm.setNextBlockTimestamp(tCreateMax);
    const { events } = await (await contract.createVirtualFloor(params)).wait();
    const { virtualFloorId } = findContractEventArgs(events, 'VirtualFloorCreation');
    expect(virtualFloorId).to.eq(params.virtualFloorId);
    await localCheckpoint.revertTo();
  });

  it('Should assign creator correctly', async () => {
    await (await contract.connect(ownerSigner).adjustCreationQuotas([{ creator: secondCreator.address, relativeAmount: 1 }])).wait();
    await (await contract.connect(secondCreator).createVirtualFloor(vfParams)).wait();
    expect(await contract.getVirtualFloorCreator(virtualFloorId)).to.eq(secondCreator.address);
  });

  it('Should create VF if right arguments passed', async () => {
    const { events } = await (await contract.createVirtualFloor(vfParams)).wait();
    const virtualFloorCreationEventArgs = findContractEventArgs(events, 'VirtualFloorCreation');
    expect(virtualFloorCreationEventArgs.virtualFloorId).to.eq(virtualFloorId);
  });

  it('Should revert if VF with same id created before', async () => {
    await (await contract.createVirtualFloor(vfParams)).wait();
    await expect(contract.createVirtualFloor(vfParams)).to.be.revertedWith('DuplicateVirtualFloorId()');
  });

  afterEach(async () => {
    await checkpoint.revertTo();
  });
});
