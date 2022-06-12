import { expect } from 'chai';
import { ethers } from 'hardhat';
import {
  FixedPointTypesMock,
  FixedPointTypesMock__factory
} from '../lib/contracts';

describe('FixedPointTypes', function () {

  let lib: FixedPointTypesMock;

  before(async function () {
    const [signer] = await ethers.getSigners();
    lib = await new FixedPointTypesMock__factory(signer).deploy();
    await lib.deployed();
  });

  it('add', async function () {
    expect(await lib.add(100_000000_000000_000000n, 23_450000_000000_000000n)).to.eq(123_450000_000000_000000n);
  });

  it('sub', async function () {
    expect(await lib.sub(123_450000_000000_000000n, 23_450000_000000_000000n)).to.eq(100_000000_000000_000000n);
  });

  it('mul0', async function () {
    expect(await lib.mul0(1_230000_000000_000000n, 3)).to.eq(3_690000_000000_000000n);
  });

  it('div0', async function () {
    expect(await lib.div0(1_000000_000000_000000n, 3)).to.eq(333333_333333_333333n);
  });

  it('divToUint256', async function () {
    expect(await lib.divToUint256(200_000000_000000_000000n, 3_000000_000000_000000n)).to.eq(66);
  });

  it('floorToUint256', async function () {
    expect(await lib.floorToUint256(987_654321_000000_000000n)).to.eq(987);
  });

  it('eq', async function () {
    expect(await lib.eq(0, 0)).to.be.true;
    expect(await lib.eq(0, 1)).to.be.false;
    expect(await lib.eq(1, 0)).to.be.false;
    expect(await lib.eq(7_000000_000000_000000n, 7_000000_000000_000000n)).to.be.true;
    expect(await lib.eq(7_000000_000000_000000n, 7_000000_000000_000001n)).to.be.false;
    expect(await lib.eq(7_000000_000000_000001n, 7_000000_000000_000000n)).to.be.false;
  });

  it('lte', async function () {
    expect(await lib.lte(0, 0)).to.be.true;
    expect(await lib.lte(0, 1)).to.be.true;
    expect(await lib.lte(1, 0)).to.be.false;
    expect(await lib.lte(7_000000_000000_000000n, 7_000000_000000_000000n)).to.be.true;
    expect(await lib.lte(7_000000_000000_000000n, 7_000000_000000_000001n)).to.be.true;
    expect(await lib.lte(7_000000_000000_000001n, 7_000000_000000_000000n)).to.be.false;
  });

  it('gte', async function () {
    expect(await lib.gte(0, 0)).to.be.true;
    expect(await lib.gte(0, 1)).to.be.false;
    expect(await lib.gte(1, 0)).to.be.true;
    expect(await lib.gte(7_000000_000000_000000n, 7_000000_000000_000000n)).to.be.true;
    expect(await lib.gte(7_000000_000000_000000n, 7_000000_000000_000001n)).to.be.false;
    expect(await lib.gte(7_000000_000000_000001n, 7_000000_000000_000000n)).to.be.true;
  });

  it('toUFixed16x4', async function () {
    expect(await lib.toUFixed16x4(234500_000000_000000n)).to.eq(2345);
    expect(await lib.toUFixed16x4(1_234500_000000_000000n)).to.eq(1_2345);
    await expect(lib.toUFixed16x4(1_234560_000000_000000n)).to.be.revertedWith('UFixed16x4LossOfPrecision(1234560000000000000)');
    expect(await lib.toUFixed16x4(6_553500_000000_000000n)).to.eq(6_5535);
    await expect(lib.toUFixed16x4(6_553510_000000_000000n)).to.be.revertedWith('UFixed16x4LossOfPrecision(6553510000000000000)');
    await expect(lib.toUFixed16x4(6_553600_000000_000000n)).to.be.revertedWith('SafeCast: value doesn\'t fit in 16 bits');
  });

  it('toUFixed32x6', async function () {
    expect(await lib.toUFixed32x6(234567_000000_000000n)).to.eq(234567);
    expect(await lib.toUFixed32x6(1_234567_000000_000000n)).to.eq(1_234567);
    await expect(lib.toUFixed32x6(1_234567_800000_000000n)).to.be.revertedWith('UFixed32x6LossOfPrecision(1234567800000000000)');
    expect(await lib.toUFixed32x6(4294_967295_000000_000000n)).to.eq(4294_967295);
    await expect(lib.toUFixed32x6(4294_967295_100000_000000n)).to.be.revertedWith('UFixed32x6LossOfPrecision(4294967295100000000000)');
    await expect(lib.toUFixed32x6(4294_967296_000000_000000n)).to.be.revertedWith('SafeCast: value doesn\'t fit in 32 bits');
  });

  it('toUFixed256x18(uint256)', async function () {
    expect(await lib.toUFixed256x18__fromUint256(123)).to.eq(123_000000_000000_000000n);
  });

  it('toUFixed256x18(UFixed16x4)', async function () {
    expect(await lib.toUFixed256x18__fromUFixed16x4(1_2345)).to.eq(1_234500_000000_000000n);
  });

  it('toUFixed256x18(UFixed32x6)', async function () {
    expect(await lib.toUFixed256x18__fromUFixed32x6(123_456789)).to.eq(123_456789_000000_000000n);
  });

});
