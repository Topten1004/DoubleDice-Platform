<template>
  <form :onsubmit="add" :onreset="clear">
    <ol>
      <li v-for="(outcome, index) in modelValue" :key="index">{{ outcome.title }}</li>
    </ol>
    <table>
      <tr>
        <td>
          <input v-model="newTitle" type="text" placeholder="Enter a title" pattern=".+" size="20" />
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
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'

const genDummyEntry = (index0: number) => [
  `Team ${String.fromCharCode('A'.charCodeAt(0) + index0)} win`
]

@Options({
  props: {
    modelValue: Object as PropType<RoomEventInfo['resultSources']>
  },
  emits: ['update:modelValue']
})
export default class NewOutcomesComponent extends Vue {
  modelValue!: RoomEventInfo['outcomes']

  newTitle = ''

  mounted(): void {
    [this.newTitle] = genDummyEntry(this.modelValue.length)
  }

  add(): boolean {
    const updated: RoomEventInfo['outcomes'] = [...this.modelValue, { title: this.newTitle }]
    this.$emit('update:modelValue', updated);
    [this.newTitle] = genDummyEntry(updated.length)
    return false
  }

  clear(): boolean {
    this.$emit('update:modelValue', []);
    [this.newTitle] = genDummyEntry(0)
    this.newTitle = ''
    return false
  }
}
</script>

<style scoped>
</style>
