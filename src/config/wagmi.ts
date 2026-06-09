import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

export const xlayerTestnet = defineChain({
  id: 1952,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testrpc.xlayer.tech'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer-test' },
  },
});

export const config = createConfig({
  chains: [xlayerTestnet],
  // We use the injected connector. OKX Wallet acts as an injected provider.
  // The 'target' can be customized if needed, but standard injected will pick up OKX wallet if it's the active extension.
  connectors: [
    injected({
      target: () => ({
        id: 'okxWallet',
        name: 'OKX Wallet',
        provider: typeof window !== 'undefined' ? (window as any).okxwallet : undefined,
      }),
    }),
  ],
  transports: {
    [xlayerTestnet.id]: http(),
  },
});
