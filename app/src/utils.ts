import { decodeDoubleDiceCustomErrorData } from '@doubledice/platform/lib/contracts'
import { BigNumber as BigDecimal } from 'bignumber.js'
import { BigNumber as BigInteger } from 'ethers'

export const flatten = <T>(arrays: T[][]): T[] => Array.prototype.concat(...arrays)

export const tryCatch = async (func: () => Promise<void>): Promise<void> => {
  try {
    await func()
  } catch (e: any) {
    if (
      e.code &&
      e.code === -32603 &&
      e.data &&
      e.data.message
    ) {
      if (
        e.data.code &&
        e.data.code === 3 &&
        typeof e.data.message === 'string' &&
        e.data.data &&
        typeof e.data.data === 'string' &&
        /^0x/.test(e.data.data)
      ) {
        const message = e.data.message as string
        const data = e.data.data as string
        const decoded = decodeDoubleDiceCustomErrorData(data)
        if (decoded) {
          alert(`${message}: ${decoded.name}(${decoded.formattedArgs})`)
        } else {
          alert(`${message}: ${data}`)
        }
      } else {
        alert(e.data.message)
      }
    } else {
      throw e
    }
  }
}

export const formatTimestamp = (timestamp: string | number): string => {
  return new Date(parseInt(timestamp.toString()) * 1000).toISOString().slice(0, 19).replace(/-/g, '\u2011')
}

export const sumBigDecimals = (values: BigDecimal[]): BigDecimal => {
  return values.reduce((a: BigDecimal, b: BigDecimal) => a.plus(b), new BigDecimal(0))
}

export const sumNumbers = (values: number[]): number => {
  return values.reduce((a: number, b: number) => a + b, 0)
}

export const getSystemTimestamp = (): number => Math.floor(Date.now() / 1000)

export const toFixedPointEthersBigNumber = (value: number, decimals: number): BigInteger =>
  BigInteger.from(new BigDecimal(value).times(new BigDecimal(10).pow(decimals)).toString())
