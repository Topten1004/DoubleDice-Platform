<template>
  <form :onsubmit="add" :onreset="clear">
    <span v-for="(opponent, index) in modelValue" :key="index">
      <img
        style="height: 64px; margin:10px"
        :src="opponent.image"
        :title="opponent.title"
        :alt="opponent.title"
      />
    </span>
    <table>
      <tr>
        <td>
          <input v-model="newTitle" type="text" placeholder="Enter a title" pattern=".+" size="20" />
        </td>
        <td>
          <input
            v-model="newImage"
            type="url"
            placeholder="Enter a image URL"
            pattern="https?://.+"
            size="60"
          />
        </td>
        <td>
          <button type="submit">+</button>
          <button type="reset">↺</button>
        </td>
      </tr>
    </table>
  </form>
</template>

<script lang="ts">
import { RoomEventInfo } from '@doubledice/platform/lib/contracts'
import { ethers } from 'ethers'
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'

const genDummyEntry = (index0: number) => {
  const teamLetter = String.fromCharCode('A'.charCodeAt(0) + index0)
  const bgColor = ethers.utils.hexDataSlice(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(teamLetter)), 29).slice(2).toUpperCase()
  const fgColor = parseInt(bgColor, 16) < 0x808080 ? 'FFFFFF' : '000000'
  return [
    `Team ${teamLetter}`,
    `https://via.placeholder.com/256/${bgColor}/${fgColor}.png?text=${encodeURIComponent(teamLetter)}`
  ]
}

@Options({
  props: {
    modelValue: Object as PropType<RoomEventInfo['resultSources']>
  },
  emits: ['update:modelValue']
})
export default class NewOpponentsComponent extends Vue {
  modelValue!: RoomEventInfo['opponents']

  newTitle = ''

  newImage = ''

  mounted(): void {
    [this.newTitle, this.newImage] = genDummyEntry(this.modelValue.length)
  }

  add(): boolean {
    const updated: RoomEventInfo['opponents'] = [...this.modelValue, { title: this.newTitle, image: this.newImage }]
    this.$emit('update:modelValue', updated);
    [this.newTitle, this.newImage] = genDummyEntry(updated.length)
    return false
  }

  clear(): boolean {
    this.$emit('update:modelValue', []);
    [this.newTitle, this.newImage] = genDummyEntry(0)
    return false
  }
}
</script>

<style scoped>
</style>
