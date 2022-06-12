import assert from 'assert';
import { ethers } from 'hardhat';
import {
  upgradeDoubleDice
} from '../helpers';

const {
  CHAIN_ID,
  OWNER_ADDRESS,
  DOUBLEDICE_CONTRACT_ADDRESS,
  DOUBLEDICE_PROXY_ADMIN_ADDRESS,
} = process.env;

async function main() {

  assert(CHAIN_ID);
  assert(OWNER_ADDRESS);
  assert(DOUBLEDICE_CONTRACT_ADDRESS);
  assert(DOUBLEDICE_PROXY_ADMIN_ADDRESS);

  const { chainId } = await ethers.provider.getNetwork();
  assert(parseInt(CHAIN_ID) === chainId, `${CHAIN_ID} !== ${chainId}; wrong .env config?`);

  const deployer = await ethers.getSigner(OWNER_ADDRESS);

  await upgradeDoubleDice({
    deployer: deployer,
    deployArgs: [],
    deployedTransparentUpgradeableProxyAddress: DOUBLEDICE_CONTRACT_ADDRESS,
    deployedProxyAdminAddress: DOUBLEDICE_PROXY_ADMIN_ADDRESS,
  });

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
