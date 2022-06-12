<template>
  <tbody class="virtual-floor">
    <tr :id="`virtual-floor-${virtualFloor.id}`">
      <td :colspan="(showVfJsonCol ? 1 : 0) + 9 + maxOutcomes">
        <Timeline
          :min="minVirtualFloorTimestamp"
          :start="Number(virtualFloor.tCreated)"
          :open="Number(virtualFloor.tOpen)"
          :close="Number(virtualFloor.tClose)"
          :resolve="Number((virtualFloor.tResultSetMin))"
          :max="maxVirtualFloorTimestamp"
          :locked="fastforwarding"
          :now="nextBlockTimestamp"
        />
        <div>
          <h2>
            {{ virtualFloor.title }}
            <span style="float: right">
              <span class="label">{{ virtualFloor.subcategory.category.slug }}</span>
              <span class="label">{{ virtualFloor.subcategory.slug }}</span>
              <span class="label">
                <span title="visibility: public" v-if="virtualFloor.isListed">👁️</span>
                <span title="visibility: unlisted" v-else>🙈</span>
              </span>
            </span>
          </h2>
          <p>{{ virtualFloor.description }}</p>
          <p>
            <span>Result sources:&nbsp;</span>
            <span
              v-for="(resultSource, index) in virtualFloor.resultSources"
              :key="resultSource.id"
            >
              <span v-if="index > 0">,&nbsp;</span>
              <a :href="resultSource.url">{{ resultSource.title }}</a>
            </span>
            <span>.</span>
          </p>
          <div>
            <template v-for="(opponent, index) in virtualFloor.opponents" :key="opponent.id">
              <div
                style="display: inline-block; font-size: xx-large; font-style: italic; padding: 30px"
                v-if="index > 0"
              >
                <span>VS</span>
              </div>
              <div style="display: inline-block">
                <div>
                  <img style="height: 64px" :src="opponent.image" :title="opponent.title" />
                </div>
                <div>{{ opponent.title }}</div>
              </div>
            </template>
          </div>
        </div>
        <div style="text-align: right">
          <button
            :disabled="!isCancellableBecauseUnresolvable"
            @click="cancelVirtualFloorUnresolvable"
          >Cancel VF because unresolvable</button>
        </div>
      </td>
    </tr>
    <tr>
      <template v-if="showVfJsonCol">
        <td rowspan="2">
          <pre style="font-size: xx-small">{{ JSON.stringify(virtualFloor, null, 2) }}</pre>
        </td>
      </template>
      <td rowspan="2" :title="virtualFloor.id">
        {{ virtualFloor.id }}
        <br />
        <a :href="`http://localhost:3000/bet/${virtualFloor.intId}`">{{ virtualFloor.intId }}</a>
      </td>
      <td rowspan="2">{{ virtualFloor.state }}</td>
      <td rowspan="2">
        <table>
          <tr :title="`tCreated = ${virtualFloor.tCreated}`">
            <th>tCreated</th>
            <td>{{ formatTimestamp(tCreated) }}</td>
          </tr>
          <tr :title="`tOpen = ${virtualFloor.tOpen}`">
            <th>tOpen</th>
            <td>{{ formatTimestamp(tOpen) }}</td>
          </tr>
          <tr :title="`tClose = ${virtualFloor.tClose}`">
            <th>tClose</th>
            <td>{{ formatTimestamp(tClose) }}</td>
          </tr>
          <tr :title="`tResultSetMin = ${virtualFloor.tResultSetMin}`">
            <th>tResultSetMin</th>
            <td>{{ formatTimestamp(tResultSetMin) }}</td>
          </tr>
        </table>
      </td>
      <td rowspan="2">{{ `${Number(virtualFloor.creationFeeRate) * 100}%` }}</td>
      <td rowspan="2">{{ `${Number(virtualFloor.platformFeeRate) * 100}%` }}</td>
      <td
        rowspan="2"
      >{{ virtualFloor.paymentToken.symbol }}/{{ virtualFloor.paymentToken.decimals }}</td>
      <td
        rowspan="2"
      >{{ virtualFloor.owner.id.slice(0, 10) }}{{ isOwnedByConnectedAccount ? ' (you)' : '' }}</td>
      <td rowspan="2">{{ beta.toFixed(6) }}</td>
      <td rowspan="2">{{ virtualFloor.totalSupply }}</td>
      <template v-for="outcome in virtualFloor.outcomes" :key="outcome.id">
        <Outcome
          :contract="contract"
          :virtualFloor="virtualFloor"
          :outcome="outcome"
          :nextBlockTimestamp="nextBlockTimestamp"
          :isVirtualFloorUnresolvable="isUnresolvable"
          @balanceChange="$emit('balanceChange')"
        />
      </template>
    </tr>
    <tr>
      <td :colspan="virtualFloor.outcomes.length">
        <div v-if="preparedClaim">
          <button
            @click="claim"
            style="width: 100%; height: 30px; font-size: larger"
          >{{ claimButtonText }}</button>
        </div>
        <div v-else style="text-align: center;">Not possible to claim</div>
      </td>
    </tr>
  </tbody>
</template>

<script lang="ts">
import { DoubleDice as DoubleDiceContract } from '@doubledice/platform/lib/contracts'
import {
  PreparedClaim,
  prepareVirtualFloorClaim,
  VirtualFloor as VirtualFloorEntity,
  VirtualFloorClaimType,
  VirtualFloorState as VirtualFloorEntityState
} from '@doubledice/platform/lib/graph'
import assert from 'assert'
import BigDecimal from 'bignumber.js'
import { BigNumber, ContractTransaction } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'
import { formatTimestamp, sumNumbers, tryCatch } from '../utils'
import Outcome from './OutcomeComponent.vue'
import Timeline from './Timeline.vue'

@Options({
  props: {
    contract: Object as PropType<DoubleDiceContract>,
    virtualFloor: Object as PropType<VirtualFloorEntity>,
    connectedAccountAddress: String,
    minVirtualFloorTimestamp: Number,
    maxVirtualFloorTimestamp: Number,
    maxOutcomes: Number,
    fastforwarding: Boolean,
    nextBlockTimestamp: Number,
    showVfJsonCol: Boolean
  },
  components: {
    Timeline,
    Outcome
  },

  emits: {
    balanceChange: String // null?
  }
})
export default class VirtualFloorComponent extends Vue {
  contract!: DoubleDiceContract
  virtualFloor!: VirtualFloorEntity
  connectedAccountAddress!: string
  minVirtualFloorTimestamp!: number
  maxVirtualFloorTimestamp!: number
  maxOutcomes!: number
  fastforwarding!: boolean
  nextBlockTimestamp!: number
  showVfJsonCol!: boolean

  get tCreated(): number {
    return Number(this.virtualFloor.tCreated)
  }

  get tOpen(): number {
    return Number(this.virtualFloor.tOpen)
  }

  get tClose(): number {
    return Number(this.virtualFloor.tClose)
  }

  get tResultSetMin(): number {
    return Number(this.virtualFloor.tResultSetMin)
  }

  get isOwnedByConnectedAccount(): boolean {
    return this.virtualFloor.owner.id === this.connectedAccountAddress?.toLowerCase()
  }

  get beta(): number {
    const t = Math.max(this.tOpen, Math.min(this.nextBlockTimestamp, this.tClose))
    return 1 + ((this.tClose - t) * (Number(this.virtualFloor.betaOpen) - 1)) / (this.tClose - this.tOpen)
  }

  get isRunning(): boolean {
    return this.virtualFloor.state === VirtualFloorEntityState.Active_ResultNone && this.nextBlockTimestamp < this.tClose
  }

  get isClosed(): boolean {
    return this.virtualFloor.state === VirtualFloorEntityState.Active_ResultNone && this.nextBlockTimestamp >= this.tClose
  }

  get isUnresolvable(): boolean {
    const bonusAmount = BigNumber.from(this.virtualFloor.bonusAmount)
    const nonzeroOutcomeCount = sumNumbers(
      this.virtualFloor.outcomes.map(({ totalSupply }) =>
        Number(new BigDecimal(totalSupply).gt(0))
      )
    ) + (bonusAmount.gt(0) ? 1 : 0)
    return (this.isClosed && nonzeroOutcomeCount < 2) ||
      this.virtualFloor.state === VirtualFloorEntityState.Claimable_Refunds_ResolvableNever
  }

  get isCancellableBecauseUnresolvable(): boolean {
    return this.isUnresolvable && this.virtualFloor.state !== VirtualFloorEntityState.Claimable_Refunds_ResolvableNever
  }

  async cancelVirtualFloorUnresolvable(): Promise<void> {
    // eslint-disable-next-line space-before-function-paren
    await tryCatch(async () => {
      const tx = await this.contract.cancelVirtualFloorUnresolvable(this.virtualFloor.id)
      const { hash } = tx
      const txUrl = `https://polygonscan.com/tx/${hash}`
      console.log(`Sent ${txUrl}`)
      await tx.wait()
      console.log(`⛏ Mined ${txUrl}`)
      this.$emit('balanceChange') // tx could result in bonusAmount refund
    })
  }

  formatTimestamp(timestamp: string | number): string {
    return formatTimestamp(timestamp)
  }

  get preparedClaim(): PreparedClaim | null {
    return prepareVirtualFloorClaim(this.virtualFloor)
  }

  get claimButtonText(): string {
    const claim = this.preparedClaim
    assert(claim)
    const what = claim.claimType === VirtualFloorClaimType.Payouts ? 'winnings' : 'refunds'
    return `Claim ${this.virtualFloor.paymentToken.symbol} ${claim.totalClaimAmount} in ${what}`
  }

  async claim(): Promise<void> {
    const preparedClaim = this.preparedClaim
    assert(preparedClaim)
    // eslint-disable-next-line space-before-function-paren
    await tryCatch(async () => {
      let tx: ContractTransaction
      if (preparedClaim.claimType === VirtualFloorClaimType.Payouts) {
        tx = await this.contract.claimPayouts(this.virtualFloor.id, preparedClaim.tokenIds)
      } else {
        tx = await this.contract.claimRefunds(this.virtualFloor.id, preparedClaim.tokenIds)
      }
      const { hash } = tx
      const txUrl = `https://polygonscan.com/tx/${hash}`
      console.log(`Sent ${txUrl}`)
      await tx.wait()
      console.log(`⛏ Mined ${txUrl}`)
      this.$emit('balanceChange') // tx will probably result in balance change
    })
  }
}
</script>

<style scoped>
tbody.virtual-floor {
  outline: 1px dashed black;
}

.label {
  background: lightsteelblue;
  padding: 4px;
  margin: 4px;
  border-radius: 10px;
}
</style>
