import type { Chain } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  bsc,
  bscTestnet,
  localhost,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from "wagmi/chains";

export const CHAINS = [
  mainnet,
  sepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  bsc,
  bscTestnet,
  localhost,
] as const satisfies readonly Chain[];

export type SupportedChain = (typeof CHAINS)[number];

const CHAIN_MAP = new Map<number, Chain>(
  CHAINS.map((chain) => [chain.id, chain]),
);

export function getChain(chainId: number | undefined): Chain | undefined {
  if (chainId === undefined) return undefined;
  return CHAIN_MAP.get(chainId);
}

export function chainName(chainId: number | undefined): string {
  return getChain(chainId)?.name ?? `Chain ${chainId ?? "?"}`;
}

export function chainShortName(chainId: number | undefined): string {
  const chain = getChain(chainId);
  if (!chain) return String(chainId ?? "?");
  return chain.name
    .replace(" Mainnet", "")
    .replace("Smart Chain", "BSC")
    .replace("OP Mainnet", "Optimism");
}

export function explorerAddressUrl(
  chainId: number,
  address: string,
): string | undefined {
  const base = getChain(chainId)?.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : undefined;
}

export function explorerTxUrl(
  chainId: number,
  hash: string,
): string | undefined {
  const base = getChain(chainId)?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export function explorerBlockUrl(
  chainId: number,
  block: string | bigint,
): string | undefined {
  const base = getChain(chainId)?.blockExplorers?.default.url;
  return base ? `${base}/block/${block}` : undefined;
}

export function isLocalChain(chainId: number): boolean {
  return chainId === localhost.id;
}

/** Etherscan V2 supports all configured public chains except localhost. */
export function explorerAbiSupported(chainId: number): boolean {
  return getChain(chainId) !== undefined && !isLocalChain(chainId);
}

export const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";

export const DEFAULT_CHAIN_ID = sepolia.id;
