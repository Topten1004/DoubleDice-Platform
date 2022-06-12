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
  generateRandomVirtualFloorId,
  SignerWithAddress,
  toFp18,
  toTimestamp,
  UNSPECIFIED_COMMITMENT_DEADLINE,
  UserCommitment
} from '../../helpers';
import {
  DoubleDice,
  DummyUSDCoin,
  DummyWrappedBTC,
  VirtualFloorCreationParamsStruct
} from '../../lib/contracts';

chai.use(chaiSubset);

let helper: DoubleDicePlatformHelper;

const creationFeeRate_e18 = 50000_000000_000000n; // 0.05 = 5%

describe('DoubleDice/FeeRelated', function () {
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

  describe('Fee related tests', function () {
    let virtualFloorId: BigNumberish;
    const betaOpen_e18 = BigNumber.from(10)
      .pow(18)
      .mul(13); // 1 unit per hour
    const tOpen = toTimestamp('2022-06-01T10:00:00');
    const tClose = toTimestamp('2032-01-01T10:00:00');
    const tResolve = toTimestamp('2032-01-02T00:00:00');
    const nOutcomes = 3;

    let virtualFloorCreationParams: VirtualFloorCreationParamsStruct;

    beforeEach(async () => {
      // Random virtual floor for each test case
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

    it('Users of equal commitment should get equal share', async () => {
      const checkpoint = await EvmCheckpoint.create();
      const amountToCommit = $(100);

      await helper.mintTokenAndGiveAllowanceToContract({
        mintAmount: amountToCommit,
        allowanceAmount: amountToCommit,
        contractAddress: contract.address,
        ownerSigner,
        usersSigner: [user1Signer, user2Signer, user3Signer],
        token
      });

      // winners commitment
      const user1CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user1Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);
      const user2CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user2Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);

      // loser commitment
      await helper.commitToVirtualFloor(virtualFloorId, 0, user3Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);

      await evm.setNextBlockTimestamp(tResolve);

      const [resolutionEvent] = await helper.setResultThenLaterConfirmUnchallengedResult(ownerSigner, virtualFloorId, 1);

      const user1BalanceBeforeClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceBeforeClaim = await token.balanceOf(user1Signer.address);

      await helper.claimPayouts(user1Signer, virtualFloorId, [user1CommitmentEventArgs.tokenId]);
      await helper.claimPayouts(user2Signer, virtualFloorId, [user2CommitmentEventArgs.tokenId]);

      const user1BalanceAfterClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceAfterClaim = await token.balanceOf(user1Signer.address);

      const collectedFee = await token.balanceOf(await contract.platformFeeBeneficiary());

      const user1Profit = user1BalanceAfterClaim.sub(user1BalanceBeforeClaim);
      const user2Profit = user2BalanceAfterClaim.sub(user2BalanceBeforeClaim);

      expect(collectedFee).to.be.eq(resolutionEvent.platformFeeAmount);

      // Assert loser commitment is equal to winners profit + fee
      expect(amountToCommit).to.be.eq(
        resolutionEvent.winnerProfits
          .add(resolutionEvent.platformFeeAmount)
          .add(resolutionEvent.creatorFeeAmount)
      );

      expect(user1Profit).to.be.gt(0);
      expect(user1Profit).to.be.eq(user2Profit);
      await checkpoint.revertTo();
    });


    it('Time span should affect only same amount after vf open time', async () => {
      const amountToCommit = $(100000000000);

      await helper.mintTokenAndGiveAllowanceToContract({
        mintAmount: amountToCommit,
        allowanceAmount: amountToCommit,
        contractAddress: contract.address,
        ownerSigner,
        usersSigner: [user1Signer, user2Signer, user3Signer, user4Signer],
        token
      });


      // set to open time
      await evm.setNextBlockTimestamp('2022-06-01T10:00:00');
      // winners commitment
      const user1CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user1Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);
      await evm.setNextBlockTimestamp('2028-06-01T10:00:00');
      const user2CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user2Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);
      await evm.setNextBlockTimestamp('2029-06-01T10:00:00');
      const user3CommitmentEventArgs: UserCommitment = await helper.commitToVirtualFloor(virtualFloorId, 1, user3Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);

      console.log('user1 commitment', user1CommitmentEventArgs.timeslot.toNumber());
      console.log('user2 commitment', user2CommitmentEventArgs.timeslot.toNumber());
      console.log('user3 commitment', user3CommitmentEventArgs.timeslot.toNumber());

      console.log('beta commitment', user1CommitmentEventArgs.beta_e18);
      console.log('beta commitment', user3CommitmentEventArgs.beta_e18);

      // loser commitment
      await helper.commitToVirtualFloor(virtualFloorId, 0, user4Signer, amountToCommit, UNSPECIFIED_COMMITMENT_DEADLINE);


      expect(user3CommitmentEventArgs.tokenId).to.not.be.eq(user1CommitmentEventArgs.tokenId);
      expect(user3CommitmentEventArgs.beta_e18).to.not.be.eq(user1CommitmentEventArgs.beta_e18);

      await evm.setNextBlockTimestamp('2032-01-02T00:00:00');
      const [resolutionEvent] = await helper.setResultThenLaterConfirmUnchallengedResult(ownerSigner, virtualFloorId, 1);

      const user1BalanceBeforeClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceBeforeClaim = await token.balanceOf(user1Signer.address);

      await helper.claimPayouts(user1Signer, virtualFloorId, [user1CommitmentEventArgs.tokenId]);
      await helper.claimPayouts(user2Signer, virtualFloorId, [user2CommitmentEventArgs.tokenId]);
      await helper.claimPayouts(user3Signer, virtualFloorId, [user3CommitmentEventArgs.tokenId]);

      const user1BalanceAfterClaim = await token.balanceOf(user1Signer.address);
      const user2BalanceAfterClaim = await token.balanceOf(user1Signer.address);

      const collectedFee = await token.balanceOf(await contract.platformFeeBeneficiary());

      const user1Profit = user1BalanceAfterClaim.sub(user1BalanceBeforeClaim);
      console.log('user1Profit', user1Profit);
      const user2Profit = user2BalanceAfterClaim.sub(user2BalanceBeforeClaim);
      console.log('user2Profit', user2Profit);

      expect(collectedFee).to.be.eq(resolutionEvent.platformFeeAmount);

      // Assert loser commitment is equal to winners profit + fee
      expect(amountToCommit).to.be.eq(
        resolutionEvent.winnerProfits
          .add(resolutionEvent.platformFeeAmount)
          .add(resolutionEvent.creatorFeeAmount)
      );

      expect(user1Profit).to.be.gt(0);
      expect(user1Profit).to.be.eq(user2Profit);

    });

  });
});
