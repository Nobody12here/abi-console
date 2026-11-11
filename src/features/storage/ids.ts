import { getAddress } from "viem";

/** Stable identity of a saved contract: one binding per chain and address. */
export function bindingId(chainId: number, address: string): string {
  return `${chainId}:${getAddress(address)}`;
}
