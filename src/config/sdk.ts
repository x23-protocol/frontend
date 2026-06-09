import { X42SDK } from "@x42/sdk";

// In a real app, these would come from .env
const RPC_URL = "https://testrpc.xlayer.tech";
// Using the studio endpoint or a local one if we were running it locally.
// We'll use a placeholder URL for the graph, to be replaced by the user's actual subgraph URL.
const SUBGRAPH_URL = "https://api.studio.thegraph.com/query/1744327/x-42/v0.0.5";

// Router and Controller proxy addresses from our deployment
const ROUTER_ADDRESS = "0xEed8D75A35bbDB7Df0c8491B68545C8bFb9F9c6a"; // Replace with actual deployed proxy address if available
const CONTROLLER_ADDRESS = "0x08CDeB8914AeE9eCa91FA6bF916903d9265Ab4d8"; // Replace with actual

export const sdk = new X42SDK(
  {
    rpcUrl: RPC_URL,
    subgraphUrl: SUBGRAPH_URL,
    chainId: 1952,
  },
  ROUTER_ADDRESS as `0x${string}`,
  CONTROLLER_ADDRESS as `0x${string}`
);
