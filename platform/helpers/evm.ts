import { BigNumber, providers } from 'ethers';
import hre from 'hardhat';
import { toTimestamp } from '.';

// Ported from https://github.com/DoubleDice-com/doubledice-token/blob/master/test/lib/utils.ts
export class EvmCheckpoint {

  private readonly provider: providers.JsonRpcProvider;

  private latestSnapshot: string;

  private constructor(provider: providers.JsonRpcProvider, initSnapshot: string) {
    this.provider = provider;
    this.latestSnapshot = initSnapshot;
  }

  static async create(provider: providers.JsonRpcProvider = hre.ethers.provider, log = false): Promise<EvmCheckpoint> {
    const snapshot = await provider.send('evm_snapshot', []);
    if (log) console.log(`Captured EVM snapshot ${snapshot}`);
    return new EvmCheckpoint(provider, snapshot);
  }

  async revertTo(log = false) {
    const ok = await this.provider.send('evm_revert', [this.latestSnapshot]);
    if (!ok) {
      throw new Error(`Error reverting to EVM snapshot ${this.latestSnapshot}`);
    }
    if (log) console.log(`Reverted to EVM snapshot ${this.latestSnapshot}`);
    this.latestSnapshot = await this.provider.send('evm_snapshot', []);
    if (log) console.log(`Captured EVM snapshot ${this.latestSnapshot}`);
  }
}

export class EvmHelper {

  private readonly provider: providers.JsonRpcProvider;

  constructor(provider: providers.JsonRpcProvider) {
    this.provider = provider;
  }

  async setNextBlockTimestamp(datetime: string | number | BigNumber): Promise<void> {
    let timestamp: number;
    if (typeof datetime === 'string') {
      timestamp = toTimestamp(datetime);
    } else {
      timestamp = BigNumber.from(datetime).toNumber();
    }
    await this.provider.send('evm_setNextBlockTimestamp', [timestamp]);
  }

}

