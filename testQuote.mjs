import { createPublicClient, http, parseAbiItem } from 'viem';
import { xlayerTestnet } from 'viem/chains';

const client = createPublicClient({
  chain: xlayerTestnet,
  transport: http('https://testrpc.xlayer.tech')
});

async function main() {
  const curve = '0x8A82A091BEBE1B130304581CF75EfcA7226Cdc6B';
  const market = '0x9F77e3b5bf3Ce7852e3588f2885422a02b14068C';
  const abi = parseAbiItem('function calRedeemValueByOtDelta(address,uint256,uint256,bytes) view returns (uint256,uint256)');
  
  try {
    const res = await client.readContract({
      address: curve,
      abi: [abi],
      functionName: 'calRedeemValueByOtDelta',
      args: [market, 1n, 1000000000000000000n, "0x"]
    });
    console.log("Result for 1e18:", res);
  } catch(e) {
    console.log("Error for 1e18:", e.message);
  }
}
main();
