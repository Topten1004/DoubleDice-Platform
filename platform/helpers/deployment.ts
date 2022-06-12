import { BytesLike } from 'ethers';
import { SignerWithAddress } from '.';
import {
  DoubleDice,
  DoubleDice__factory,
  DummyUSDCoin,
  DummyUSDCoin__factory,
  DummyWrappedBTC,
  DummyWrappedBTC__factory,
  GraphHelper,
  GraphHelper__factory,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory
} from '../lib/contracts';

// Here we could simply use @openzeppelin/hardhat-upgrades deployProxy function,
// but it does not work yet,
// compilation fails with error "Error: No node with id 5102 of type StructDefinition,EnumDefinition"
// Probably because user-defined value types are not yet supported:
// https://github.com/OpenZeppelin/openzeppelin-upgrades/issues/477
// This replacement can be dropped as soon as there is support

export const deployProxy = async ({
  name,
  proxyAdminAddress,
  deployer,
  deployedImplAddress,
  encodedInitializerData,
}: {
  name: string;
  proxyAdminAddress?: string,
  deployer: SignerWithAddress;
  deployedImplAddress: string;
  encodedInitializerData: BytesLike;
}): Promise<string> => {
  if (proxyAdminAddress) {
    process.stdout.write(`Using ProxyAdmin already deployed at ${proxyAdminAddress}\n`);
  } else {
    const proxyAdmin = await new ProxyAdmin__factory(deployer).deploy();
    process.stdout.write(`Deploying ProxyAdmin to: ${proxyAdmin.address}...\n`);
    process.stdout.write(`Sent transaction: ${proxyAdmin.deployTransaction.hash}\n`);
    await proxyAdmin.deployed();
    proxyAdminAddress = proxyAdmin.address;
  }

  const proxy = await new TransparentUpgradeableProxy__factory(deployer).deploy(
    deployedImplAddress,
    proxyAdminAddress,
    encodedInitializerData
  );

  process.stdout.write(`Deploying ${name} proxy to: ${proxy.address}...\n`);
  process.stdout.write(`Sent transaction: ${proxy.deployTransaction.hash}\n`);
  await proxy.deployed();

  return proxy.address;
};

export async function deployDummyUSDCoin(deployer: SignerWithAddress): Promise<DummyUSDCoin> {
  const contract = await new DummyUSDCoin__factory(deployer).deploy();
  process.stdout.write(`Deploying USDC contract to: ${contract.address}...\n`);
  process.stdout.write(`Sent transaction: ${contract.deployTransaction.hash}\n`);
  await contract.deployed();
  return contract;
}

export async function deployDummyWrappedBTC(deployer: SignerWithAddress): Promise<DummyWrappedBTC> {
  const contract = await new DummyWrappedBTC__factory(deployer).deploy();
  process.stdout.write(`Deploying WBTC contract to: ${contract.address}...\n`);
  process.stdout.write(`Sent transaction: ${contract.deployTransaction.hash}\n`);
  await contract.deployed();
  return contract;
}

export async function deployDoubleDice({
  deployer,
  deployArgs,
  initializeArgs
}: {
  deployer: SignerWithAddress;
  deployArgs: Parameters<DoubleDice__factory['deploy']>;
  initializeArgs: [Parameters<DoubleDice['initialize']>[0], Parameters<DoubleDice['initialize']>[1]]; // No TypeScript magic can do this for now
}): Promise<DoubleDice> {
  const impl = await new DoubleDice__factory(deployer).deploy(...deployArgs);
  process.stdout.write(`Deploying DoubleDice impl to: ${impl.address}...\n`);
  process.stdout.write(`Sent transaction: ${impl.deployTransaction.hash}\n`);
  await impl.deployed();
  const encodedInitializerData = impl.interface.encodeFunctionData('initialize', initializeArgs);
  const proxyAddress = await deployProxy({ name: 'DoubleDice', deployer: deployer, deployedImplAddress: impl.address, encodedInitializerData });
  const contract = DoubleDice__factory.connect(proxyAddress, deployer);

  process.stdout.write(`Granting OPERATOR_ROLE to admin ${deployer.address}\n`);
  await (await contract.grantRole(await contract.OPERATOR_ROLE(), deployer.address)).wait();

  process.stdout.write(`Granting quota of 100 rooms to admin ${deployer.address}\n`);
  await (await contract.adjustCreationQuotas([{ creator: deployer.address, relativeAmount: 100 }])).wait();

  return contract;
}

export async function deployGraphHelper({
  deployer,
  proxyAdminAddress,
}: {
  deployer: SignerWithAddress;
  proxyAdminAddress?: string;
}): Promise<GraphHelper> {
  const graphHelperImpl = await new GraphHelper__factory(deployer).deploy();
  process.stdout.write(`Deploying GraphHelper impl to: ${graphHelperImpl.address}...\n`);
  process.stdout.write(`Sent transaction: ${graphHelperImpl.deployTransaction.hash}\n`);
  await graphHelperImpl.deployed();
  const proxyAddress = await deployProxy({
    name: 'GraphHelper',
    proxyAdminAddress,
    deployer,
    deployedImplAddress: graphHelperImpl.address,
    encodedInitializerData: '0x',
  });
  return GraphHelper__factory.connect(proxyAddress, deployer);
}

export async function upgradeDoubleDice({
  deployer,
  deployArgs,
  deployedTransparentUpgradeableProxyAddress,
  deployedProxyAdminAddress,
}: {
  deployer: SignerWithAddress;
  deployArgs: Parameters<DoubleDice__factory['deploy']>;
  deployedTransparentUpgradeableProxyAddress: string;
  deployedProxyAdminAddress: string;
}): Promise<void> {

  const impl = await new DoubleDice__factory(deployer).deploy(...deployArgs);
  process.stdout.write(`Deploying DoubleDice impl to: ${impl.address}...\n`);
  process.stdout.write(`Sent transaction: ${impl.deployTransaction.hash}\n`);
  await impl.deployed();
  process.stdout.write('Deployed.\n\n');
  const implAddress = impl.address;

  // Note: If impl is deployed correctly, but for some reason upgrade fails with
  // "execution reverted: ERC1967: new implementation is not a contract",
  // comment the code block above, set implAddress directly, and reattempt upgrade.

  process.stdout.write(`Calling ProxyAdmin(${deployedProxyAdminAddress}),\n`);
  process.stdout.write(`  to upgrade TransparentUpgradeableProxyAddress(${deployedTransparentUpgradeableProxyAddress}),\n`);
  process.stdout.write(`  to just-deployed impl DoubleDice(${implAddress})...\n`);
  const proxyAdmin = ProxyAdmin__factory.connect(deployedProxyAdminAddress, deployer);
  await (await proxyAdmin.upgrade(deployedTransparentUpgradeableProxyAddress, implAddress)).wait();
  process.stdout.write('Upgraded.\n');
}
