<template>
  <td class="outcome">
    <table style="width: 100%">
      <tr>
        <th colspan="4">{{ outcome.title }}</th>
      </tr>
      <tr>
        <th>total</th>
        <td>{{ outcomeTotalSupply }} {{ virtualFloor.paymentToken.symbol }}</td>
        <td>×</td>
        <td>{{ outcomeAverageBeta.toFixed(2) }}</td>
      </tr>
      <tr>
        <th>user</th>
        <td>{{ userTotalBalance }} {{ virtualFloor.paymentToken.symbol }}</td>
        <td>×</td>
        <td>{{ userAverageBeta.toFixed(2) }}</td>
      </tr>
      <tr>
        <td colspan="4">
          <button
            style="display: block; width: 100%"
            @click="commit"
            :disabled="!canCommit"
          >Commit 1 {{ virtualFloor.paymentToken.symbol }}</button>
        </td>
      </tr>
      <tr>
        <td colspan="4">
          <div
            v-if="isWinningOutcome"
            style="text-align: center; font-size: xx-large"
          >{{ winningText }}</div>
          <button
            v-else
            style="display: block; width: 100%"
            @click="resolve"
            :disabled="!canResolve"
          >Resolve</button>
        </td>
      </tr>
    </table>
  </td>
</template>

<script lang="ts">
import { DoubleDice as DoubleDiceContract } from '@doubledice/platform/lib/contracts'
import {
  Outcome as OutcomeEntity,
  VirtualFloor as VirtualFloorEntity,
  VirtualFloorState
} from '@doubledice/platform/lib/graph'
import { BigNumber as BigDecimal } from 'bignumber.js'
import { BigNumber, ethers } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'

@Options({
  props: {
    contract: Object as PropType<DoubleDiceContract>,
    virtualFloor: Object as PropType<VirtualFloorEntity>,
    outcome: Object as PropType<OutcomeEntity>,
    nextBlockTimestamp: Number,
    isVirtualFloorUnresolvable: Boolean
  },
  emits: {
    balanceChange: String // null?
  }
})
export default class OutcomeComponent extends Vue {
  contract!: DoubleDiceContract
  virtualFloor!: VirtualFloorEntity
  outcome!: OutcomeEntity
  nextBlockTimestamp!: number
  isVirtualFloorUnresolvable!: boolean

  get outcomeTotalSupply(): BigDecimal {
    return new BigDecimal(this.outcome.totalSupply)
  }

  get outcomeAverageBeta(): BigDecimal {
    if (this.outcomeTotalSupply.eq(0)) {
      return new BigDecimal(0)
    }
    const totalSupply = new BigDecimal(this.outcome.totalSupply)
    const totalWeightedSupply = new BigDecimal(this.outcome.totalWeightedSupply)
    return totalWeightedSupply.dividedBy(totalSupply)
  }

  get userTotalBalance(): BigDecimal {
    if (this.outcome.userOutcomes.length) {
      const [{ totalBalance }] = this.outcome.userOutcomes
      return new BigDecimal(totalBalance)
    }
    return new BigDecimal(0)
  }

  get userAverageBeta(): BigDecimal {
    if (this.outcome.userOutcomes.length) {
      const [{ totalBalance, totalWeightedBalance }] = this.outcome.userOutcomes
      return new BigDecimal(totalWeightedBalance).dividedBy(totalBalance)
    }
    return new BigDecimal(0)
  }

  get canCommit(): boolean {
    return this.virtualFloor.state === VirtualFloorState.Active_ResultNone &&
      this.nextBlockTimestamp < Number(this.virtualFloor.tClose)
  }

  async commit(): Promise<void> {
    const amount = BigNumber.from(10).pow(this.virtualFloor.paymentToken.decimals).mul(1)
    try {
      const tx = await this.contract.commitToVirtualFloor(this.virtualFloor.id, this.outcome.index, amount, ethers.constants.MaxUint256)
      const { hash } = tx
      const txUrl = `https://polygonscan.com/tx/${hash}`
      console.log(`Sent ${txUrl}`)
      await tx.wait()
      console.log(`⛏ Mined ${txUrl}`)
    } catch (e: any) {
      if (e.code && e.code === -32603 && e.data && e.data.message) {
        alert(e.data.message)
      } else {
        console.error(e)
      }
    } finally {
      this.$emit('balanceChange')
    }
  }

  get canResolve(): boolean {
    return this.virtualFloor.state === VirtualFloorState.Active_ResultNone &&
      this.nextBlockTimestamp >= Number(this.virtualFloor.tResultSetMin) &&
      !this.isVirtualFloorUnresolvable
  }

  async resolve(): Promise<void> {
    try {
      const tx = await this.contract.finalizeUnsetResult(this.virtualFloor.id, this.outcome.index)
      const { hash } = tx
      const txUrl = `https://polygonscan.com/tx/${hash}`
      console.log(`Sent ${txUrl}`)
      await tx.wait()
      console.log(`⛏ Mined ${txUrl}`)
    } catch (e: any) {
      if (e.code && e.code === -32603 && e.data && e.data.message) {
        alert(e.data.message)
      } else {
        console.error(e)
      }
    } finally {
      this.$emit('balanceChange')
    }
  }

  get isWinningOutcome(): boolean {
    const isResolvedState = this.virtualFloor.state === VirtualFloorState.Claimable_Payouts ||
      this.virtualFloor.state === VirtualFloorState.Claimable_Refunds_ResolvedNoWinners
    return isResolvedState && this.outcome.index === this.virtualFloor.winningOutcome?.index
  }

  get winningText(): string {
    switch (this.virtualFloor.state) {
      case VirtualFloorState.Claimable_Payouts:
        return '🏆'
      case VirtualFloorState.Claimable_Refunds_ResolvedNoWinners:
        return '🤷'
      default:
        return '?'
    }
  }
}
</script>

<style scoped>
.outcome table .outcome table {
  border-spacing: 10px !important;
}
.outcome td {
  /* background-color: #f0f0f0 !important; */
  padding: 5px !important;
}
</style>
