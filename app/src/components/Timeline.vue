<template>
  <div>
    <!-- https://www.schemecolor.com/traffic-red-yellow-green.php -->
    <div
      :style="{ height: '15px', background: `linear-gradient(90deg, lightgray 0%, lightgray ${startPercent}, #008450 ${startPercent}, #008450 ${closePercent}, #EFB700 ${closePercent}, #EFB700 ${resolvePercent}, #B81D13 ${resolvePercent}, #B81D13 100%)` }"
    />
    <div
      :style="{ height: '5px', background: `linear-gradient(90deg, var(--now-color) 0%, var(--now-color) ${nowPercent}, lightgray ${nowPercent}, lightgray 100%)` }"
      v-bind:class="{ locked: locked }"
    />
  </div>
</template>

<script lang="ts">
import { Options, Vue } from 'vue-class-component'

@Options({
  props: {
    min: Number,
    start: Number,
    open: Number,
    close: Number,
    resolve: Number,
    max: Number,
    now: Number,
    locked: Boolean
  }
})
export default class Timeline extends Vue {
  min!: number
  start!: number
  open!: number
  close!: number
  resolve!: number
  max!: number
  now!: number
  locked = false

  get startPercent(): string {
    return `${(((this.open - this.min) * 100) / (this.max - this.min)).toFixed(4)}%`
  }

  get closePercent(): string {
    return `${(((this.close - this.min) * 100) / (this.max - this.min)).toFixed(4)}%`
  }

  get resolvePercent(): string {
    return `${(((this.resolve - this.min) * 100) / (this.max - this.min)).toFixed(4)}%`
  }

  get nowPercent(): string {
    return `${(((this.now - this.min) * 100) / (this.max - this.min)).toFixed(4)}%`
  }
}
</script>

<style scoped>
* {
  --now-color: blue;
}
.locked {
  --now-color: red;
}
</style>
