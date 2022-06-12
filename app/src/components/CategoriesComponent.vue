<template>
  <section style="text-align: left">
    <h2>By category</h2>
    <ul>
      <li v-for="category in categories" :key="category.id">
        <div>
          <span>{{ category.slug }}</span>
          <ul>
            <li v-for="subcategory in category.subcategories" :key="subcategory.id">
              <div>
                <span>{{ subcategory.slug }}</span>
                <ul>
                  <li v-for="virtualFloor in subcategory.virtualFloors" :key="virtualFloor.id">
                    <div>
                      <a :href="`#virtual-floor-${virtualFloor.id}`">{{ virtualFloor.title }}</a>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </section>
</template>

<script lang="ts">
import { Category as CategoryEntity } from '@doubledice/platform/lib/graph'
import gql from 'graphql-tag'
import { Options, Vue } from 'vue-class-component'

@Options({
  apollo: {
    categories: {
      query: gql`query {
        categories {
          id
          slug
          subcategories {
            id
            slug
            virtualFloors {
              id
              title
            }
          }
        }
      }`,
      pollInterval: 1 * 1000
    }
  }
})
export default class CategoriesComponent extends Vue {
  categories!: CategoryEntity[]
}
</script>

<style scoped>
ul {
  list-style-type: "> ";
}
li {
  display: list-item;
}
</style>
