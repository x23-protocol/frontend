export type Address = `0x${string}`;

export interface X42Config {
  rpcUrl: string;
  subgraphUrl: string;
  chainId: number;
}
