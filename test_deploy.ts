import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import controllerArtifact from '../contracts/FTControllerV2/out/FTControllerV2.sol/FTControllerV2.json' assert { type: 'json' };

async function main() {
  const pk = process.env.PRIVATE_KEY || '';
  const hexPk = pk.startsWith('0x') ? pk : `0x${pk}`;
  const account = privateKeyToAccount(hexPk as `0x${string}`);
  const client = createPublicClient({
    transport: http('https://testrpc.xlayer.tech'),
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const end = now + 86400n * 7n; 
  // Pass 100 OT (18 decimals)
  const otSeedParsed = parseUnits("100", 18);

  try {
    const { request } = await client.simulateContract({
      address: "0x3a41c50DAFcf907Ed44c508c3638Ca01aAd5BFAF",
      abi: controllerArtifact.abi,
      functionName: 'deployMarket',
      args: [
        {
          timestampEnd: end,
          title: "New Market " + now.toString(),
          ancillaryData: "0x",
          imageUri: "",
          outcomeNames: ["YES", "NO"],
          outcomeImageUris: ["", ""],
        },
        {
          parentTokenId: 0n,
          collateral: "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c",
          curve: "0x8A82A091BEBE1B130304581CF75EfcA7226Cdc6B",
          timestampStart: now,
        },
        account.address,
        otSeedParsed
      ],
      account,
    });
    console.log("Simulation succeeded!");
  } catch (e: any) {
    console.error("Simulation failed:", e.message || e);
    if (e.cause) console.error("Cause:", e.cause.message || e.cause);
  }
}
main();
