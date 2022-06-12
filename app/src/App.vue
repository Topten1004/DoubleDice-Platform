<template>
  <img style="height: 100px" alt="DoubleDice 🎲🎲" src="./assets/logo.png" />
  <hr />
  <table class="info">
    <tr>
      <th>Network (🦊)</th>
      <td>{{ networkDescription }}</td>
    </tr>
    <tr>
      <th>Last block timestamp</th>
      <td>{{ formatTimestamp(latestBlockTimestamp) }}</td>
    </tr>
    <tr>
      <th>Next block timestamp</th>
      <td>{{ formatTimestamp(nextBlockTimestamp) }}</td>
    </tr>
    <tr>
      <th>Account (🦊)</th>
      <td>{{ accountAddress }}</td>
    </tr>
    <tr>
      <th>VF quota</th>
      <td>{{ quotaText }}</td>
    </tr>
    <tr>
      <th>Total VFs created</th>
      <td>{{ totalVirtualFloorsCreated }}</td>
    </tr>
    <tr>
      <th>
        Does connected account
        <br />own DD contract?
      </th>
      <td>{{ owner ? 'yes' : 'no' }}</td>
    </tr>
    <tr>
      <th>Platform-fee beneficiary</th>
      <td>{{ platformFeeBeneficiary }}</td>
    </tr>
    <tr v-if="paymentTokens && contract && accountSigner">
      <th>Tokens</th>
      <td>
        <table>
          <PaymentTokenComponent
            v-for="paymentToken in paymentTokens"
            :key="paymentToken.id"
            :provider="injectedProvider"
            :paymentToken="paymentToken"
            :platformContractAddress="contract?.address"
            :accountSigner="accountSigner"
          ></PaymentTokenComponent>
        </table>
      </td>
    </tr>
    <tr>
      <th>EVM time</th>
      <td>
        <button @click="fastforward({ minutes: 1 })" :disabled="isFastforwarding">⏩ +1m</button>
        <button @click="fastforward({ minutes: 30 })" :disabled="isFastforwarding">⏩ +30m</button>
        <button @click="fastforward({ hours: 1 })" :disabled="isFastforwarding">⏩ +1h</button>
        <button @click="fastforward({ days: 1 })" :disabled="isFastforwarding">⏩ +24h</button>
        <button @click="fastforward({ days: 3 })" :disabled="isFastforwarding">⏩ +3d</button>
      </td>
    </tr>
  </table>

  <hr />

  <div style="text-align: left">
    <label>Expand</label>
    <input type="checkbox" v-model="expanded" />
  </div>

  <table id="virtual-floors" :class="{ expanded }">
    <colgroup>
      <col />
      <col />
      <col class="collapsible-column" />
      <col class="collapsible-column" />
      <col class="collapsible-column" />
    </colgroup>
    <thead>
      <tr>
        <template v-if="showVfJsonCol">
          <th>json</th>
        </template>
        <th>id</th>
        <th>state</th>
        <th>timeline</th>
        <th>creationFeeRate</th>
        <th>platformFeeRate</th>
        <th>paymentToken</th>
        <th>owner</th>
        <th>beta</th>
        <th>totalSupply</th>
        <template v-for="index in maxOutcomeCount" :key="index">
          <th>Outcome № {{ index + 1 }}</th>
        </template>
      </tr>
    </thead>
    <VirtualFloorComponent
      v-for="virtualFloor in virtualFloors"
      :key="virtualFloor.id"
      :contract="contract"
      :virtualFloor="virtualFloor"
      :connectedAccountAddress="accountAddress"
      :minVirtualFloorTimestamp="minVirtualFloorTimestamp"
      :maxVirtualFloorTimestamp="maxVirtualFloorTimestamp"
      :maxOutcomes="maxOutcomeCount.length"
      :fastforwarding="isFastforwarding"
      :nextBlockTimestamp="nextBlockTimestamp"
      :showVfJsonCol="showVfJsonCol"
      @balanceChange="refreshBalances"
    />
  </table>

  <hr />

  <NewVirtualFloor
    v-if="contract && paymentTokens && nextBlockTimestamp"
    :contract="contract"
    :paymentTokens="paymentTokens"
    :nextBlockTimestamp="nextBlockTimestamp"
  />

  <hr />

  <div style="text-align: left">
    <a
      href="chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#settings/advanced"
      target="blank"
    >🦊🩹 Reset MetaMask account after restarting network</a>
  </div>

  <hr />

  <CategoriesComponent />
</template>

<script lang="ts">
import { EthereumProvider, EthereumProviderHelper } from '@/mm'
import { formatTimestamp, getSystemTimestamp } from '@/utils'
// eslint-disable-next-line camelcase
import { DoubleDice, DoubleDice__factory, ERC20PresetMinterPauser } from '@doubledice/platform/lib/contracts'
import {
  PaymentToken as PaymentTokenEntity,
  User as UserEntity,
  VirtualFloor as VirtualFloorEntity,
  VirtualFloorsAggregate as VirtualFloorsAggregateEntity
} from '@doubledice/platform/lib/graph'
import { BigNumber as BigDecimal } from 'bignumber.js'
import { ethers, providers } from 'ethers'
import gql from 'graphql-tag'
import { Options, Vue } from 'vue-class-component'
import CategoriesComponent from './components/CategoriesComponent.vue'
import NewVirtualFloor from './components/NewVirtualFloor.vue'
import PaymentTokenComponent from './components/PaymentTokenComponent.vue'
import VirtualFloorComponent from './components/VirtualFloorComponent.vue'
import { CHAIN_ID, MAIN_CONTRACT_ADDRESS, POLL_INTERVAL_SECONDS, PROVIDER_URL, USER_ACCOUNT, SHOW_VF_JSON_COL } from './config'

BigDecimal.config({ DECIMAL_PLACES: 18 })

const VIRTUAL_FLOORS_QUERY = gql`query userVirtualFloors($userId: String!) {
  virtualFloors(orderBy: tCreated, orderDirection: desc) {
    id
    intId
    paymentToken {
      symbol
      decimals
    }
    platformFeeRate
    tCreated
    tOpen
    tClose
    tResultSetMin
    state
    winningOutcome {
      ...commonOutcomeFields
    }
    winnerProfits
    totalSupply
    betaOpen
    owner {
      id
    }
    outcomes {
      ...commonOutcomeFields
    }
    bonusAmount

    # pure metadata
    subcategory {
      slug
      category {
        slug
      }
    }
    title
    description
    isListed
    opponents {
      id
      title
      image
    }
    resultSources {
      id
      title
      url
    }
  }
}

fragment commonOutcomeFields on Outcome {
  index
  title
  totalSupply
  totalWeightedSupply
  userOutcomes(where: {user: $userId, totalBalance_gt: 0}) {
    totalBalance
    totalWeightedBalance
    userOutcomeTimeslots(where: {balance_gt: 0}) {
      balance
      outcomeTimeslot {
        beta
        timeslot
        tokenId
      }
    }
  }
}`

const delay = (seconds: number) =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000))

const directProvider = new ethers.providers.JsonRpcProvider(PROVIDER_URL)

@Options({
  props: {
  },
  components: {
    VirtualFloorComponent,
    NewVirtualFloor,
    PaymentTokenComponent,
    CategoriesComponent
  },
  apollo: {
    virtualFloorsAggregate: {
      query: gql`query {
        virtualFloorsAggregate(id: "singleton") {
          totalVirtualFloorsCreated
        }
      }`,
      pollInterval: POLL_INTERVAL_SECONDS * 1000
    },
    virtualFloors: {
      query: VIRTUAL_FLOORS_QUERY,
      variables: {
        userId: USER_ACCOUNT.toLowerCase()
      },
      pollInterval: POLL_INTERVAL_SECONDS * 1000
    },
    user: {
      query: gql`query userQuery($userId: String!){
        user(id: $userId) {
          id
          maxConcurrentVirtualFloors
          concurrentVirtualFloors
        }
      }`,
      variables: {
        userId: USER_ACCOUNT.toLowerCase()
      },
      pollInterval: POLL_INTERVAL_SECONDS * 1000
    },
    paymentTokens: {
      query: gql`query {
        paymentTokens {
          id
          address
          name
          symbol
          decimals
        }
      }`,
      pollInterval: POLL_INTERVAL_SECONDS * 1000
    }
  }
})
export default class App extends Vue {
  showVfJsonCol = SHOW_VF_JSON_COL

  virtualFloorsAggregate!: VirtualFloorsAggregateEntity | null

  virtualFloors!: VirtualFloorEntity[]

  user!: UserEntity | null

  paymentTokens!: PaymentTokenEntity[]

  accountAddress!: string
  accountSigner!: providers.JsonRpcSigner

  owner?: boolean

  networkDescription?: string

  platformFeeBeneficiary?: string

  beta?: number

  balance: BigDecimal = new BigDecimal(0)
  allowance: BigDecimal = new BigDecimal(0)

  nextBlockTimestamp = 0

  latestBlockTimestamp = 0

  isFastforwarding = false

  isMounted = false

  timeAdjustment = 0

  expanded = false

  async fastforward({
    days = 0, hours = 0, minutes = 0, seconds = 0
  }: {
    days?: number, hours?: number, minutes?: number, seconds?: number
  }): Promise<void> {
    if (this.isFastforwarding) {
      return
    }
    this.isFastforwarding = true
    this.timeAdjustment = await directProvider.send('evm_increaseTime', [((days * 24 + hours) * 60 + minutes) * 60 + seconds])
    await directProvider.send('evm_mine', [])
    const { timestamp } = await directProvider.getBlock('latest')
    this.latestBlockTimestamp = timestamp
    this.isFastforwarding = false
  }

  contract!: DoubleDice
  tokenContract!: ERC20PresetMinterPauser

  injectedProvider!: providers.Web3Provider

  get maxOutcomeCount(): number[] {
    if (this.virtualFloors === undefined) {
      return []
    }
    const maxOutcomes = Math.max(...this.virtualFloors.map(({ outcomes }) => outcomes.length))
    const out = []
    for (let i = 0; i < maxOutcomes; i++) {
      out.push(i)
    }
    return out
  }

  get minVirtualFloorTimestamp(): number {
    return this.isMounted
      ? Math.min(
        this.latestBlockTimestamp,
        ...this.virtualFloors.map(({ tCreated }) => Number(new BigDecimal(tCreated))),
        ...this.virtualFloors.map(({ tOpen }) => Number(new BigDecimal(tOpen)))
      ) - 86400
      : -Infinity
  }

  get maxVirtualFloorTimestamp(): number {
    return this.isMounted ? Math.max(this.latestBlockTimestamp, ...this.virtualFloors.map(({ tResultSetMin }) => Number(new BigDecimal(tResultSetMin)))) + 86400 : Infinity
  }

  formatTimestamp(timestamp: string | number): string {
    return formatTimestamp(timestamp)
  }

  async mounted(): Promise<void> {
    console.log('Mounted 🐴')

    const ethereum = window.ethereum as EthereumProvider

    const eth = new EthereumProviderHelper(ethereum)

    await eth.init()

    // We must specify the network as 'any' for ethers to allow network changes
    this.injectedProvider = new providers.Web3Provider(ethereum, 'any')

    // Note: This is the only way of "squeezing" this Ganache-internal value out of Ganache
    // See https://github.com/trufflesuite/ganache/blob/v7.0.0-alpha.0/src/chains/ethereum/ethereum/src/blockchain.ts#L713
    this.timeAdjustment = await directProvider.send('evm_increaseTime', [0])

    const { timestamp } = await directProvider.getBlock('latest')
    this.latestBlockTimestamp = timestamp

    setInterval(() => {
      this.nextBlockTimestamp = getSystemTimestamp() + this.timeAdjustment
    }, 1000)

    const signer = this.injectedProvider.getSigner()
    this.accountAddress = await signer.getAddress()
    this.accountSigner = signer

    const { name: networkName, chainId: networkChainId } = await this.injectedProvider.getNetwork()
    if (networkChainId !== CHAIN_ID) {
      alert(`Was expecting ${CHAIN_ID}, not ${networkChainId}`)
    }
    this.networkDescription = `${networkName}(🔗${networkChainId})`

    const mainContract = DoubleDice__factory.connect(MAIN_CONTRACT_ADDRESS, signer)

    this.contract = mainContract

    this.owner = await mainContract.hasRole(await mainContract.DEFAULT_ADMIN_ROLE(), this.accountAddress)

    this.platformFeeBeneficiary = await mainContract.platformFeeBeneficiary()

    await this.refreshBalances()

    this.isMounted = true
  }

  async refreshBalances(): Promise<void> {
    console.log('Refreshing balances...')
    this.$forceUpdate()
  }

  get quotaText(): string {
    const user = this.user || {
      maxConcurrentVirtualFloors: 0,
      concurrentVirtualFloors: 0
    }
    return `${user.concurrentVirtualFloors} of ${user.maxConcurrentVirtualFloors} active VFs`
  }

  get totalVirtualFloorsCreated(): number {
    const { totalVirtualFloorsCreated } = this.virtualFloorsAggregate || { totalVirtualFloorsCreated: 0 }
    return totalVirtualFloorsCreated
  }
}
</script>

<style>
h3 {
  margin: 40px 0 0;
}

a {
  color: #42b983;
}
table {
  font-family: monospace;
  /* font-size: xx-large; */
  text-align: left;
}
.info th::after {
  content: ":";
}

table#virtual-floors {
  border-spacing: 5px;
  border-collapse: separate;
}

#virtual-floors td,
#virtual-floors th {
  background-color: #f7f7f7;
  padding: 10px;
}

#virtual-floors th {
  text-align: center;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

.admin {
  background-color: red !important;
}

#virtual-floors:not(.expanded) .collapsible-column {
  visibility: collapse;
}

button {
  padding: 2px;
  margin: 2px;
}
</style>
