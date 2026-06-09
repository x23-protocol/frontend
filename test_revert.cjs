const { createPublicClient, http, encodeFunctionData, parseUnits } = require('viem');
const { xLayerTestnet } = require('viem/chains');

// Minimal ABI for deployMarket
const abi = [
  {
    "inputs": [
      {
        "components": [
          {"internalType": "uint96", "name": "timestampEnd", "type": "uint96"},
          {"internalType": "string", "name": "title", "type": "string"},
          {"internalType": "bytes", "name": "ancillaryData", "type": "bytes"},
          {"internalType": "string", "name": "imageUri", "type": "string"},
          {"internalType": "string[]", "name": "outcomeNames", "type": "string[]"},
          {"internalType": "string[]", "name": "outcomeImageUris", "type": "string[]"}
        ],
        "internalType": "struct QuestionParams",
        "name": "paramsQuestion",
        "type": "tuple"
      },
      {
        "components": [
          {"internalType": "address", "name": "collateral", "type": "address"},
          {"internalType": "uint256", "name": "parentTokenId", "type": "uint256"},
          {"internalType": "address", "name": "curve", "type": "address"},
          {"internalType": "uint96", "name": "timestampStart", "type": "uint96"}
        ],
        "internalType": "struct MarketParams",
        "name": "paramsMarket",
        "type": "tuple"
      },
      {"internalType": "address", "name": "oracle", "type": "address"},
      {"internalType": "uint256", "name": "otSeed", "type": "uint256"}
    ],
    "name": "deployMarket",
    "outputs": [
      {"internalType": "bytes32", "name": "questionId", "type": "bytes32"},
      {"internalType": "address", "name": "market", "type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const client = createPublicClient({
  chain: xLayerTestnet,
  transport: http("https://testrpc.xlayer.tech"),
});

async function run() {
  const account = "0xa803dfd7faE492bf700A3B77c13e1aD41191b3F0";
  const controller = "0x08CDeB8914AeE9eCa91FA6bF916903d9265Ab4d8";
  
  const txData = encodeFunctionData({
    abi,
    functionName: 'deployMarket',
    args: [
      {
        timestampEnd: BigInt(Math.floor(Date.now() / 1000) + 86400),
        title: "Test Market",
        ancillaryData: "0x",
        imageUri: "",
        outcomeNames: ["Yes", "No"],
        outcomeImageUris: ["", ""]
      },
      {
        collateral: "0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c",
        parentTokenId: 0n,
        curve: "0x9fdF2994900Bb58EAf61b9301D5e63ee4e1eB74E",
        timestampStart: BigInt(Math.floor(Date.now() / 1000))
      },
      account,
      parseUnits("1", 18)
    ]
  });

  try {
    console.log("Simulating...");
    await client.call({
      to: controller,
      data: txData,
      account
    });
    console.log("Success!");
  } catch (e) {
    console.error("Revert Reason:", e.shortMessage || e.message);
    if (e.data) console.error("Revert Data:", e.data);
  }
}

run();
