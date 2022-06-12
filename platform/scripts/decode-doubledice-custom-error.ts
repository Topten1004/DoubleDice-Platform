import { task } from 'hardhat/config';
import { decodeDoubleDiceCustomErrorData } from '../lib/contracts';

// E.g.
//
// $ npx hardhat decode-dd-error 0xf1df2bd0
// Error: CreationQuotaExceeded()
// Data:  []

task('decode-dd-error', 'Decode DoubleDice contract custom error data')
  .addPositionalParam('data', 'Error data 0x...')
  .setAction(async ({ data }) => {
    const decoded = decodeDoubleDiceCustomErrorData(data);
    if (decoded) {
      const { name, formattedArgs } = decoded;
      console.log(`${name}(${formattedArgs})`);
    } else {
      console.log(`No matching custom error found on the DoubleDice contract for data: ${data}`);
    }
  });
