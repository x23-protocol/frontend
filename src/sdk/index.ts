export * from "./types";
export * from "./abis";
export * from "./core/client";
export * from "./modules/indexer";
export * from "./modules/market";
export * from "./modules/controller";

import { X42Client } from "./core/client";
import { IndexerModule } from "./modules/indexer";
import { MarketModule } from "./modules/market";
import { ControllerModule } from "./modules/controller";
import type { Address } from "./types";

/**
 * Main SDK wrapper that instantiates all submodules
 */
export class X42SDK {
  public client: X42Client;
  public indexer: IndexerModule;
  public market: MarketModule;
  public controller: ControllerModule;

  constructor(
    config: { rpcUrl: string; subgraphUrl: string; chainId: number },
    routerAddress: Address,
    controllerAddress: Address
  ) {
    this.client = new X42Client(config);
    this.indexer = new IndexerModule(this.client);
    this.market = new MarketModule(this.client, routerAddress);
    this.controller = new ControllerModule(this.client, controllerAddress);
  }
}
