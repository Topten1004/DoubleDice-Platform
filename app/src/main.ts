import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client/core'
import detectEthereumProvider from '@metamask/detect-provider'
import { createApolloProvider } from '@vue/apollo-option'
import { createApp, h } from 'vue'
import App from './App.vue'
import { GRAPHQL_QUERIES_URL } from './config'

async function main() {
  const ethereumProvider = await detectEthereumProvider()

  // HTTP connection to the API
  const httpLink = createHttpLink({ uri: GRAPHQL_QUERIES_URL })

  // Cache implementation
  const cache = new InMemoryCache()

  // Create the apollo client
  const apolloClient = new ApolloClient({
    link: httpLink,
    cache
  })

  const apolloProvider = createApolloProvider({
    defaultClient: apolloClient
  })

  if (ethereumProvider) {
    // From now on, this should always be true:
    // provider === window.ethereum
    const app = createApp({
      render: () => h(App)
    })
    app.use(apolloProvider)

    // app.config.globalProperties.$filters = {
    //   formatTimestamp(timestamp: string | number): string {
    //     return new Date(parseInt(timestamp.toString()) * 1000).toISOString().slice(0, 19).replace(/-/g, '\u2011')
    //   }
    // }

    app.mount('#app')
  } else {
    alert('🦊 Please install MetaMask! 🦊')
  }
}

main()
