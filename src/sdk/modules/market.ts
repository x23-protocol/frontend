import { encodeFunctionData } from "viem";
import { X42Client } from "../core/client";
import { FTRouterV2ABI } from "../abis/FTRouterV2ABI";
import type { Address } from "../types";

export class MarketModule {
  public routerAddress: Address;

  constructor(_client: X42Client, routerAddress: Address) {
    this.routerAddress = routerAddress;
  }

  /**
   * Helper to encode a swapMarketV2 transaction payload
   */
  encodeSwap(
    market: Address,
    receiver: Address,
    tokenId: bigint,
    params: {
      isMint: boolean;
      amount: bigint;
      isExactIn: boolean;
      minOutOrMaxIn: bigint;
    },
    dataSwap: `0x${string}`,
    dataGuess: `0x${string}`,
    integrator: Address,
    integratorFeeBps: bigint
  ) {
    return encodeFunctionData({
      abi: FTRouterV2ABI,
      functionName: "swapMarketV2",
      args: [
        market,
        receiver,
        tokenId,
        params,
        dataSwap,
        dataGuess,
        integrator,
        integratorFeeBps
      ]
    });
  }
}
