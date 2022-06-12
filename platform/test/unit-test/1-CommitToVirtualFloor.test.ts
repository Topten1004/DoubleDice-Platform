import chai, { expect } from 'chai';
import chaiSubset from 'chai-subset';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import {
  $,
  deployDoubleDice,
  deployDummyUSDCoin,
  DoubleDicePlatformHelper,
  ENCODED_DUMMY_METADATA,
  EvmCheckpoint,
  EvmHelper,
  findUserCommitmentEventArgs,
  generateRandomVirtualFloorId, SignerWithAddress,
  timestampMinuteCeil,
  toFp18,
  toTimestamp,
  UNSPECIFIED_COMMITMENT_DEADLINE
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

describe('DoubleDice/Commit', function () {
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

  describe('Commit To Virtual Floor', function () {
    // Random virtual floor for each test case
    let virtualFloorId: BigNumberish;
    const tOpen = toTimestamp('2022-06-01T12:00:00');
    const tClose = toTimestamp('2032-01-01T12:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour

    const outcomeIndex = 0;
    const amount = $(10);

    let virtualFloorCreationParams: VirtualFloorCreationParamsStruct;

    beforeEach(async () => {
      // Mint 1000$ to each user
      await helper.mintTokensForUser({
        token,
        ownerSigner,
        userAddress: user1Signer.address,
        amount: $(1000),
      });
      await helper.mintTokensForUser({
        token,
        ownerSigner,
        userAddress: user2Signer.address,
        amount: $(1000),
      });
      await helper.mintTokensForUser({
        token,
        ownerSigner,
        userAddress: user3Signer.address,
        amount: $(1000),
      });

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

      virtualFloorId = generateRandomVirtualFloorId();

      virtualFloorCreationParams = {
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

      await (
        await contract.createVirtualFloor({
          ...virtualFloorCreationParams,
          paymentToken: paymentTokenAddress,
        })
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
      await evm.setNextBlockTimestamp('2032-01-01T13:00:00');

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
      const balanceOfContractBeforeCommit = await token.balanceOf(
        contract.address
      );
      await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const balanceOfContractAfterCommit = await token.balanceOf(
        contract.address
      );
      expect(
        balanceOfContractAfterCommit.sub(balanceOfContractBeforeCommit)
      ).to.be.eq(amount);
    });

    it('Should increase the VF aggregate commitment by the amount', async function () {
      const aggregateBalanceBeforeCommit = await contract.getVirtualFloorOutcomeTotals(
        virtualFloorId,
        outcomeIndex
      );
      await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const aggregateBalanceAfterCommit = await contract.getVirtualFloorOutcomeTotals(
        virtualFloorId,
        outcomeIndex
      );
      expect(
        aggregateBalanceAfterCommit.amount.sub(
          aggregateBalanceBeforeCommit.amount
        )
      ).to.be.eq(amount);
    });

    it('Should generate same token ID if the commitment is before open time', async function () {
      const localCheckpoint = await EvmCheckpoint.create();

      await evm.setNextBlockTimestamp(tOpen - 10 * 60);

      const { events: commitment1Events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const commitment1EventArgs = findUserCommitmentEventArgs(
        commitment1Events
      );

      await evm.setNextBlockTimestamp(tOpen - 5 * 60);

      const { events: commitment2Events } = await (
        await contract
          .connect(user1Signer)
          .commitToVirtualFloor(virtualFloorId, outcomeIndex, amount, UNSPECIFIED_COMMITMENT_DEADLINE)
      ).wait();
      const commitment2EventArgs = findUserCommitmentEventArgs(
        commitment2Events
      );

      expect(commitment2EventArgs.tokenId).to.be.eq(
        commitment1EventArgs.tokenId
      );

      await localCheckpoint.revertTo();
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
          paymentToken: paymentTokenAddress,
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
});
