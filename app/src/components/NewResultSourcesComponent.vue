<template>
  <form :onsubmit="add" :onreset="clear">
    <ol>
      <li v-for="(resultSource, index) in modelValue" :key="index">
        <a :href="resultSource.url">{{ resultSource.title || resultSource.url }}</a>
      </li>
    </ol>
    <table>
      <tr>
        <td>
          <input v-model="newTitle" type="text" placeholder="Enter a title" pattern=".+" size="20" />
        </td>
        <td>
          <input
            v-model="newUrl"
            type="url"
            placeholder="Enter a URL"
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
import { PropType } from 'vue'
import { Options, Vue } from 'vue-class-component'

const genDummyEntry = (index0: number) => [
  `Live stream #${1 + index0}`,
  `https://www.youtube.com/watch?v=GrsEAvRerTg&z=${1 + index0}`
]

@Options({
  props: {
    modelValue: Object as PropType<RoomEventInfo['resultSources']>
  },
  emits: ['update:modelValue']
})
export default class NewResultSourcesComponent extends Vue {
  modelValue!: RoomEventInfo['resultSources']

  newTitle = ''

  newUrl = ''

  mounted(): void {
    [this.newTitle, this.newUrl] = genDummyEntry(this.modelValue.length)
  }

  add(): boolean {
    const updated: RoomEventInfo['resultSources'] = [...this.modelValue, { title: this.newTitle, url: this.newUrl }]
    this.$emit('update:modelValue', updated);
    [this.newTitle, this.newUrl] = genDummyEntry(updated.length)
    return false
  }

  clear(): boolean {
    this.$emit('update:modelValue', []);
    [this.newTitle, this.newUrl] = genDummyEntry(0)
    return false
  }
}
</script>

<style scoped>
</style>
