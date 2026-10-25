import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { getChain } from "./chains";

export function rpcUrlFor(
  chainId: number,
  overrides: Record<number, string>,
): string | undefined {
  return overrides[chainId]?.trim() || undefined;
}

export function chainTransport(
  chainId: number,
  overrides: Record<number, string>,
) {
  return http(rpcUrlFor(chainId, overrides));
}

export function createReadClient(
  chainId: number,
  overrides: Record<number, string>,
): PublicClient {
  const chain = getChain(chainId);
  if (!chain) {
    throw new Error(`Chain ${chainId} is not supported.`);
  }
  return createPublicClient({
    chain,
    transport: chainTransport(chainId, overrides),
  });
}

export function createChainClient(chain: Chain): PublicClient {
  return createPublicClient({
    chain,
    transport: http(),
  });
}

export async function testRpcUrl(
  url: string,
  expectedChainId: number,
): Promise<number> {
  const client = createPublicClient({
    transport: http(url.trim()),
  });
  const chainId = await client.getChainId();
  if (chainId !== expectedChainId) {
    throw new Error(
      `This RPC reports chain ${chainId}, not ${expectedChainId}.`,
    );
  }
  return chainId;
}

export function validateRpcUrl(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Enter a valid URL.";
  }
  const isLocal =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "0.0.0.0";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    return "Use HTTPS, or HTTP only for localhost.";
  }
  return null;
}
