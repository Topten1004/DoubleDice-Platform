<template>
  <tbody v-if="isMounted">
    <tr>
      <td rowspan="2" style="font-size: x-large">{{ paymentToken.symbol }}</td>
      <td>Balance:</td>
      <td style="text-align: right;">{{ balance }}</td>
      <td>
        <button @click="mintSome(1)">Mint +1 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="mintSome(10)">Mint +10 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="mintSome(100)">Mint +100 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="mintSome(1000)">Mint +1000 {{ paymentToken.symbol }}</button>
      </td>
      <td></td>
      <td rowspan="2">
        <button @click="addToken" :title="`Add '${paymentToken.name}' ERC-20 token to MetaMask`">+🦊</button>
      </td>
    </tr>
    <tr>
      <td>
        Allowance to
        <br />DD contract:
      </td>
      <td style="text-align: right;">{{ allowance }}</td>
      <td>
        <button @click="increaseAllowance(1)">Allow +1 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="increaseAllowance(10)">Allow +10 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="increaseAllowance(100)">Allow +100 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="increaseAllowance(1000)">Allow +1000 {{ paymentToken.symbol }}</button>
      </td>
      <td>
        <button @click="increaseAllowance('max')">Allow max {{ paymentToken.symbol }}</button>
      </td>
    </tr>
  </tbody>
</template>

<script lang="ts">
// eslint-disable-next-line camelcase
import { DummyERC20, DummyERC20__factory } from '@doubledice/platform/lib/contracts'
import { PaymentToken as PaymentTokenEntity } from '@doubledice/platform/lib/graph'
import { BigNumber as BigDecimal } from 'bignumber.js'
import { BigNumber as BigInteger, BigNumberish, ethers, providers } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'

@Options({
  props: {
    provider: Object as PropType<providers.Web3Provider>,
    paymentToken: Object as PropType<PaymentTokenEntity>,
    platformContractAddress: String,
    accountSigner: Object as PropType<providers.JsonRpcSigner>
  },
  emits: {
    balanceChange: String // null?
  }
})
export default class PaymentTokenComponent extends Vue {
  provider!: providers.Web3Provider
  paymentToken!: PaymentTokenEntity
  platformContractAddress!: string
  accountSigner!: providers.JsonRpcSigner
  accountAddress!: string
  tokenContract!: DummyERC20
  balance!: string
  allowance!: string
  isMounted = false

  async mounted(): Promise<void> {
    this.accountAddress = await this.accountSigner.getAddress()
    this.tokenContract = DummyERC20__factory.connect(this.paymentToken.address, this.provider)
    await this.refreshAmounts()
    this.isMounted = true
  }

  get divisor(): BigDecimal {
    return new BigDecimal(10).pow(this.paymentToken.decimals)
  }

  formatAmount(amount: BigNumberish): string {
    const unitsString = BigInteger.from(amount).toString()
    const decimals = this.paymentToken.decimals
    const valueFormatted = new BigDecimal(unitsString).dividedBy(this.divisor).toFixed(decimals)
    if (BigInteger.from(amount).lt(BigInteger.from(2).pow(128))) {
      return `${valueFormatted} ${this.paymentToken.symbol}`
    } else {
      return `∞ ${this.paymentToken.symbol}`
    }
  }

  async mintSome(amountUnits: number): Promise<void> {
    const amount = BigInteger.from(amountUnits).mul(BigInteger.from(10).pow(this.paymentToken.decimals))
    await (await this.tokenContract.connect(this.accountSigner).mint(this.accountAddress, amount)).wait()
    this.refreshAmounts()
  }

  async increaseAllowance(byUnits: number | 'max'): Promise<void> {
    if (byUnits === 'max') {
      await (await this.tokenContract.connect(this.accountSigner).approve(this.platformContractAddress, ethers.constants.MaxUint256)).wait()
    } else {
      const amount = BigInteger.from(byUnits).mul(BigInteger.from(10).pow(this.paymentToken.decimals))
      await (await this.tokenContract.connect(this.accountSigner).increaseAllowance(this.platformContractAddress, amount)).wait()
    }
    await this.refreshAmounts()
  }

  async refreshAmounts(): Promise<void> {
    console.log('Refreshing amounts...')
    const [
      balanceAmount,
      allowanceAmount
    ] = await Promise.all([
      this.tokenContract.balanceOf(this.accountAddress),
      this.tokenContract.allowance(this.accountAddress, this.platformContractAddress)
    ])
    this.balance = this.formatAmount(balanceAmount)
    this.allowance = this.formatAmount(allowanceAmount)
    this.$forceUpdate() // Shouldn't be necessary... but it seems to be!
  }

  async addToken(): Promise<void> {
    const tokenAddress = this.tokenContract.address
    const tokenSymbol = this.paymentToken.symbol
    const tokenDecimals = this.paymentToken.decimals
    let tokenImage: string | undefined
    if (tokenSymbol === 'USDC') {
      tokenImage = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhLS0gQ3JlYXRlZCB3aXRoIElua3NjYXBlIChodHRwOi8vd3d3Lmlua3NjYXBlLm9yZy8pIC0tPgoKPHN2ZwogICB3aWR0aD0iNTI5LjE2NjY5bW0iCiAgIGhlaWdodD0iNTI5LjE2NjY5bW0iCiAgIHZpZXdCb3g9IjAgMCA1MjkuMTY2NjkgNTI5LjE2NjY5IgogICB2ZXJzaW9uPSIxLjEiCiAgIGlkPSJzdmc4MDUwMSIKICAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogICB4bWxuczpzdmc9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcwogICAgIGlkPSJkZWZzODA0OTgiIC8+CiAgPGcKICAgICBpZD0ibGF5ZXIxIgogICAgIHRyYW5zZm9ybT0idHJhbnNsYXRlKDE2Ni4wNjk4MiwxNzUuOTIxMTcpIj4KICAgIDxwYXRoCiAgICAgICBkPSJtIDk4LjUxMzUxLDM1My4yNDU0OSBjIDE0Ni42MjQxNCwwIDI2NC41ODMzMywtMTE3Ljk1OTE5IDI2NC41ODMzMywtMjY0LjU4MzMzIDAsLTE0Ni42MjQxNDQgLTExNy45NTkxOSwtMjY0LjU4MzMzIC0yNjQuNTgzMzMsLTI2NC41ODMzMyAtMTQ2LjYyNDE0NCwwIC0yNjQuNTgzMzMsMTE3Ljk1OTE4NiAtMjY0LjU4MzMzLDI2NC41ODMzMyAwLDE0Ni42MjQxNCAxMTcuOTU5MTg2LDI2NC41ODMzMyAyNjQuNTgzMzMsMjY0LjU4MzMzIHoiCiAgICAgICBmaWxsPSIjMjc3NWNhIgogICAgICAgaWQ9InBhdGgyIgogICAgICAgc3R5bGU9ImZpbGw6I2Q0MmUxZTtmaWxsLW9wYWNpdHk6MTtzdHJva2Utd2lkdGg6MC4yNjQ1ODMiIC8+CiAgICA8cGF0aAogICAgICAgZD0ibSAxNzEuMjczOTMsMTMwLjU1MzY0IGMgMCwtMzguNTg0MTg4IC0yMy4xNTEwNSwtNTEuODEzMzU1IC02OS40NTMxMywtNTcuMzI0NjI2IEMgNjguNzQ3ODg1LDY4LjgxODQxIDYyLjEzMzMwMiw1OS45OTk4NDggNjIuMTMzMzAyLDQ0LjU2NDA1NiBjIDAsLTE1LjQzNTc5MSAxMS4wMjUxODcsLTI1LjM1NTAyIDMzLjA3MjkxNiwtMjUuMzU1MDIgMTkuODQzNzUyLDAgMzAuODY4OTQyLDYuNjE0NTgzIDM2LjM4MDIxMiwyMy4xNTEwNDEgMS4xMDMzMSwzLjMwNzI5MiA0LjQxMDYsNS41MTEyNzEgNy43MTc4OSw1LjUxMTI3MSBoIDE3LjYzNzEzIGMgNC40MTA2LDAgNy43MTc4OSwtMy4zMDcyOTIgNy43MTc4OSwtNy43MTUyNSBWIDM5LjA1Mjc4NiBDIDE2MC4yNDg3NCwxNC43OTg0MzIgMTQwLjQwNDk5LC0zLjk0MjAwNTUgMTE1LjA0OTk3LC02LjE0NTk4NDYgViAtMzIuNjA0MzE4IGMgMCwtNC40MTA2MDQgLTMuMzA3MjksLTcuNzE3ODk1IC04LjgxODU2LC04LjgyMTIwOCBIIDg5LjY5NDk0OCBjIC00LjQxMDYwNCwwIC03LjcxNzg5NiwzLjMwNzI5MiAtOC44MjEyMDksOC44MjEyMDggViAtNy4yNDkyOTcxIEMgNDcuODAwODIzLC0yLjgzODY5MyAyNi44NTY0MDcsMTkuMjA5MDM2IDI2Ljg1NjQwNyw0Ni43NzA2ODEgYyAwLDM2LjM4MDIwOCAyMi4wNDc3MjksNTAuNzEwMDQxIDY4LjM0OTgxMSw1Ni4yMjM5NTkgMzAuODY4OTQyLDUuNTExMjcgNDAuNzkwODEyLDEyLjEyNTg1IDQwLjc5MDgxMiwyOS43NjU2MiAwLDE3LjYzOTc3IC0xNS40MzU3OSwyOS43NjU2MyAtMzYuMzgwMjA4LDI5Ljc2NTYzIC0yOC42NjQ5NTcsMCAtMzguNTg2ODMyLC0xMi4xMjg1IC00MS44OTQxMjQsLTI4LjY2NDk2IC0xLjEwMDY2NywtNC40MDc5NiAtNC40MDc5NTgsLTYuNjE0NTggLTcuNzE1MjUsLTYuNjE0NTggSCAzMS4yNjQzNjUgYyAtNC40MDc5NTgsMCAtNy43MTUyNSwzLjMwNzI5IC03LjcxNTI1LDcuNzE3ODkgdiAxLjEwMzMyIGMgNC40MDc5NTgsMjcuNTU4OTkgMjIuMDQ3NzI5LDQ3LjQwMjc0IDU4LjQyNzkzNyw1Mi45MTY2NiB2IDI2LjQ1ODMzIGMgMCw0LjQwNzk2IDMuMzA3MjkyLDcuNzE1MjUgOC44MTg1NjIsOC44MTg1NyBoIDE2LjUzNjQ1NiBjIDQuNDEwNjEsMCA3LjcxNzksLTMuMzA3MjkgOC44MjEyMSwtOC44MTg1NyB2IC0yNi40NTgzMyBjIDMzLjA3MjkyLC01LjUxMzkyIDU1LjEyMDY1LC0yOC42NjQ5NiA1NS4xMjA2NSwtNTguNDMwNTggeiIKICAgICAgIGZpbGw9IiNmZmYiCiAgICAgICBpZD0icGF0aDQiCiAgICAgICBzdHlsZT0iZmlsbDojMWZhZTRhO2ZpbGwtb3BhY2l0eToxO3N0cm9rZS13aWR0aDowLjI2NDU4MyIgLz4KICAgIDxwYXRoCiAgICAgICBkPSJNIDQyLjI4OTU1MiwyNDYuMzA4ODUgQyAtNDMuNzAwMDMsMjE1LjQ0MjU1IC04Ny43OTgxMzMsMTE5LjUzMTEgLTU1LjgyNTg4NCwzNC42NDIxODIgYyAxNi41MzY0NTgsLTQ2LjMwMjA4MyA1Mi45MTY2NjYxLC04MS41Nzg5NzkgOTguMTE1NDM2LC05OC4xMTU0MzcgNC40MTA2MDQsLTIuMjAzOTc5IDYuNjE0NTg0LC01LjUxMTI3MSA2LjYxNDU4NCwtMTEuMDI1MTg3IHYgLTE1LjQzMzE0NiBjIDAsLTQuNDEwNjA0IC0yLjIwMzk4LC03LjcxNzg5NSAtNi42MTQ1ODQsLTguODE4NTYyIC0xLjEwMzMxMiwwIC0zLjMwNzI5MSwwIC00LjQxMDYwNCwxLjEwMDY2NyBDIC02Ni44NTEwNzEsLTY0LjU3NjU2NyAtMTI0LjE3ODM0LDQ2Ljc3MDY4MSAtOTEuMTA1NDI1LDE1MS41MDA3IGMgMTkuODQzNzUsNjEuNzM1MjMgNjcuMjQ5MTQ1LDEwOS4xNDA2MiAxMjguOTg0MzczLDEyOC45ODQzNyA0LjQxMDYwNCwyLjIwMzk4IDguODIxMjA4LDAgOS45MjE4NzUsLTQuNDEwNiAxLjEwMzMxMywtMS4xMDA2NyAxLjEwMzMxMywtMi4yMDM5OCAxLjEwMzMxMywtNC40MDc5NiB2IC0xNS40MzU3OSBjIDAsLTMuMzA3MjkgLTMuMzA3MjkyLC03LjcxNTI1IC02LjYxNDU4NCwtOS45MjE4NyB6IE0gMTU5LjE0ODA3LC05Ny42NDk0ODMgYyAtNC40MTA2LC0yLjIwMzk4IC04LjgyMTIxLDAgLTkuOTIxODcsNC40MTA2MDQgLTEuMTAzMzIsMS4xMDMzMTIgLTEuMTAzMzIsMi4yMDM5NzkgLTEuMTAzMzIsNC40MTA2MDQgdiAxNS40MzMxNDUgYyAwLDQuNDEwNjA0IDMuMzA3Myw4LjgxODU2MyA2LjYxNDU5LDExLjAyNTE4OCA4NS45ODk1OCwzMC44NjYyOTEgMTMwLjA4NzY4LDEyNi43Nzc3NDggOTguMTE1NDMsMjExLjY2NjY2MiAtMTYuNTM2NDUsNDYuMzAyMDggLTUyLjkxNjY2LDgxLjU3ODk4IC05OC4xMTU0Myw5OC4xMTU0NCAtNC40MTA2MSwyLjIwMzk4IC02LjYxNDU5LDUuNTExMjcgLTYuNjE0NTksMTEuMDI1MTkgdiAxNS40MzMxNCBjIDAsNC40MTA2MSAyLjIwMzk4LDcuNzE3OSA2LjYxNDU5LDguODE4NTYgMS4xMDMzMSwwIDMuMzA3MjksMCA0LjQxMDYsLTEuMTAwNjYgQyAyNjMuODc4MDksMjQ4LjUxNTQ3IDMyMS4yMDUzNiwxMzcuMTY4MjIgMjg4LjEzMjQ1LDMyLjQzODIwMiAyNjguMjg4NywtMzAuNDAwMzM5IDIxOS43Nzk5OSwtNzcuODA1NzM0IDE1OS4xNDgwNywtOTcuNjQ5NDgzIFoiCiAgICAgICBmaWxsPSIjZmZmIgogICAgICAgaWQ9InBhdGg2IgogICAgICAgc3R5bGU9ImZpbGw6IzFmYWU0YTtmaWxsLW9wYWNpdHk6MTtzdHJva2Utd2lkdGg6MC4yNjQ1ODMiIC8+CiAgPC9nPgo8L3N2Zz4K'
    } else if (tokenSymbol === 'WBTC') {
      tokenImage = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDkuMjYgMTA5LjI2Ij4NCiAgPGRlZnM+DQogICAgPHN0eWxlPg0KICAgICAgLmNscy0xIHsNCiAgICAgICAgZmlsbDogIzFmYWU0YTsNCiAgICAgIH0NCg0KICAgICAgLmNscy0yIHsNCiAgICAgICAgZmlsbDogI2Q0MmUxZTsNCiAgICAgIH0NCg0KICAgICAgLmNscy0zIHsNCiAgICAgICAgZmlsbDogI2Q0MmUxZTsNCiAgICAgIH0NCiAgICA8L3N0eWxlPg0KICA8L2RlZnM+DQogIDx0aXRsZT53cmFwcGVkLWJpdGNvaW4td2J0YzwvdGl0bGU+DQogIDxnIGlkPSJMYXllcl8yIiBkYXRhLW5hbWU9IkxheWVyIDIiPg0KICAgIDxnIGlkPSJMYXllcl8xLTIiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+DQogICAgICA8ZyBpZD0iUGFnZS0xIj4NCiAgICAgICAgPGcgaWQ9IndidGNfY29sb3VyIiBkYXRhLW5hbWU9IndidGMgY29sb3VyIj4NCiAgICAgICAgICA8cGF0aCBpZD0iU2hhcGUiIGNsYXNzPSJjbHMtMSINCiAgICAgICAgICAgIGQ9Ik04OS4wOSwyMi45M2wtMywzYTQyLjQ3LDQyLjQ3LDAsMCwxLDAsNTcuMzJsMywzYTQ2Ljc2LDQ2Ljc2LDAsMCwwLDAtNjMuMzlaIiAvPg0KICAgICAgICAgIDxwYXRoIGlkPSJTaGFwZS0yIiBkYXRhLW5hbWU9IlNoYXBlIiBjbGFzcz0iY2xzLTEiDQogICAgICAgICAgICBkPSJNMjYsMjMuMTlhNDIuNDcsNDIuNDcsMCwwLDEsNTcuMzIsMGwzLTNhNDYuNzYsNDYuNzYsMCwwLDAtNjMuMzksMFoiIC8+DQogICAgICAgICAgPHBhdGggaWQ9IlNoYXBlLTMiIGRhdGEtbmFtZT0iU2hhcGUiIGNsYXNzPSJjbHMtMSINCiAgICAgICAgICAgIGQ9Ik0yMy4xOSw4My4yOGE0Mi40Nyw0Mi40NywwLDAsMSwwLTU3LjI5bC0zLTNhNDYuNzYsNDYuNzYsMCwwLDAsMCw2My4zOVoiIC8+DQogICAgICAgICAgPHBhdGggaWQ9IlNoYXBlLTQiIGRhdGEtbmFtZT0iU2hhcGUiIGNsYXNzPSJjbHMtMSINCiAgICAgICAgICAgIGQ9Ik04My4yOCw4Ni4wNWE0Mi40Nyw0Mi40NywwLDAsMS01Ny4zMiwwbC0zLDNhNDYuNzYsNDYuNzYsMCwwLDAsNjMuMzksMFoiIC8+DQogICAgICAgICAgPHBhdGggaWQ9IlNoYXBlLTUiIGRhdGEtbmFtZT0iU2hhcGUiIGNsYXNzPSJjbHMtMiINCiAgICAgICAgICAgIGQ9Ik03My41Nyw0NC42MmMtLjYtNi4yNi02LTguMzYtMTIuODMtOVYyN0g1NS40NnY4LjQ2Yy0xLjM5LDAtMi44MSwwLTQuMjIsMFYyN0g0NnY4LjY4SDM1LjI5djUuNjVzMy45LS4wNywzLjg0LDBhMi43MywyLjczLDAsMCwxLDMsMi4zMlY2Ny40MWExLjg1LDEuODUsMCwwLDEtLjY0LDEuMjksMS44MywxLjgzLDAsMCwxLTEuMzYuNDZjLjA3LjA2LTMuODQsMC0zLjg0LDBsLTEsNi4zMUg0NS45djguODJoNS4yOFY3NS42SDU1LjR2OC42NWg1LjI5Vjc1LjUzYzguOTItLjU0LDE1LjE0LTIuNzQsMTUuOTItMTEuMDkuNjMtNi43Mi0yLjUzLTkuNzItNy41OC0xMC45M0M3Mi4xLDUyLDc0LDQ5LjIsNzMuNTcsNDQuNjJaTTY2LjE3LDYzLjRjMCw2LjU2LTExLjI0LDUuODEtMTQuODIsNS44MVY1Ny41N0M1NC45Myw1Ny41OCw2Ni4xNyw1Ni41NSw2Ni4xNyw2My40Wk02My43Miw0N2MwLDYtOS4zOCw1LjI3LTEyLjM2LDUuMjdWNDEuNjlDNTQuMzQsNDEuNjksNjMuNzIsNDAuNzUsNjMuNzIsNDdaIiAvPg0KICAgICAgICAgIDxwYXRoIGlkPSJTaGFwZS02IiBkYXRhLW5hbWU9IlNoYXBlIiBjbGFzcz0iY2xzLTMiDQogICAgICAgICAgICBkPSJNNTQuNjIsMTA5LjI2YTU0LjYzLDU0LjYzLDAsMSwxLDU0LjY0LTU0LjY0QTU0LjYzLDU0LjYzLDAsMCwxLDU0LjYyLDEwOS4yNlptMC0xMDVBNTAuMzQsNTAuMzQsMCwxLDAsMTA1LDU0LjYyLDUwLjM0LDUwLjM0LDAsMCwwLDU0LjYyLDQuMjZaIiAvPg0KICAgICAgICA8L2c+DQogICAgICA8L2c+DQogICAgPC9nPg0KICA8L2c+DQo8L3N2Zz4='
    } else {
      tokenImage = undefined
    }

    try {
      // wasAdded is a boolean. Like any RPC method, an error may be thrown.
      const wasAdded = await this.provider.send('wallet_watchAsset', {
        type: 'ERC20', // Initially only supports ERC20, but eventually more!
        options: {
          address: tokenAddress, // The address that the token is at.
          symbol: tokenSymbol, // A ticker symbol or shorthand, up to 5 chars.
          decimals: tokenDecimals, // The number of decimals in the token
          image: tokenImage // A string url of the token logo
        }
      } as any)
      if (wasAdded) {
        console.log('Thanks for your interest!')
      } else {
        console.log('Your loss!')
      }
    } catch (error) {
      console.log(error)
    }
  }
}
</script>

<style scoped>
</style>
