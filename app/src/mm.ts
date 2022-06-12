export type HexPrefixed = `0x${string}`;

interface RequestArguments<T extends unknown[]> {
  method: string;
  // params?: unknown[] | Record<string, unknown>;
  params?: [...T]
}

export interface EthereumProvider {

  isMetaMask?: boolean;

  request<T extends unknown[], U>(args: RequestArguments<T>): Promise<U>;

  on(eventName: 'accountsChanged', listener: (accounts: [HexPrefixed]) => void): void;

  on(eventName: 'chainChanged', listener: (chainId: number) => void): void;
}

interface RequestedPermissions {
  [methodName: string]: Record<string, unknown>
}

interface Web3WalletPermission {
  // The name of the method corresponding to the permission
  parentCapability: string;

  // The date the permission was granted, in UNIX epoch time
  date?: number;
}

export class EthereumProviderHelper {
  private ethereum: EthereumProvider

  constructor(ethereum: EthereumProvider) {
    this.ethereum = ethereum
    this.ethereum.on('accountsChanged', (accounts) => this.onAccountsChanged(accounts))
    this.ethereum.on('chainChanged', (chainId) => this.onChainChanged(chainId))
  }

  onAccountsChanged(accounts: [HexPrefixed]): void {
    alert(`accounts => ${accounts}`)
    location.reload()
  }

  onChainChanged(chainId: number): void {
    alert(`chainId => ${chainId}`)
    location.reload()
  }

  async init(): Promise<void> {
    const permissions = await this.walletGetPermissions()
    if (!permissions.find(({ parentCapability }) => parentCapability === 'eth_accounts')) {
      const permissions = await this.walletRequestPermissions({ eth_accounts: {} })
      if (permissions.find(({ parentCapability }) => parentCapability === 'eth_accounts')) {
        console.log('eth_accounts permission successfully requested!')
      }
    }
  }

  async walletGetPermissions(): Promise<Web3WalletPermission[]> {
    const permissionsArray = await this.ethereum.request<[], Web3WalletPermission[]>({
      method: 'wallet_getPermissions'
    })
    return permissionsArray
  }

  async walletRequestPermissions(requestedPermissions: RequestedPermissions): Promise<Web3WalletPermission[]> {
    const permissions = await this.ethereum.request<[RequestedPermissions], Web3WalletPermission[]>({
      method: 'wallet_requestPermissions',
      params: [requestedPermissions]
    })
    return permissions
  }
}
