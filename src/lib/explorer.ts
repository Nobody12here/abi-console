import { isAddress, type Address } from "viem";
import {
  ETHERSCAN_API_URL,
  explorerAbiSupported,
  getChain,
} from "./chains";

type EtherscanResponse = {
  status?: string;
  message?: string;
  result?: unknown;
};

export class ExplorerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplorerError";
  }
}

export async function fetchExplorerAbi(
  chainId: number,
  address: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!explorerAbiSupported(chainId)) {
    throw new ExplorerError(
      "Etherscan does not support this chain. Use a file, paste, or URL instead.",
    );
  }
  if (!isAddress(address)) {
    throw new ExplorerError("Enter a valid contract address first.");
  }
  if (!apiKey.trim()) {
    throw new ExplorerError(
      "Add your Etherscan API key in Settings to use explorer lookup.",
    );
  }

  const url = new URL(ETHERSCAN_API_URL);
  url.searchParams.set("apikey", apiKey.trim());
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getabi");
  url.searchParams.set("address", address as Address);

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ExplorerError("The explorer request was cancelled.");
    }
    throw new ExplorerError(
      "Could not reach Etherscan. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw new ExplorerError(
      `Etherscan returned HTTP ${response.status}. Try again shortly.`,
    );
  }

  const data = (await response.json()) as EtherscanResponse;
  const message = typeof data.message === "string" ? data.message : "";
  const result = data.result;

  if (data.status !== "1" || typeof result !== "string") {
    const detail =
      typeof result === "string" && result.length < 240
        ? result
        : "No ABI was returned.";
    if (/rate limit/i.test(detail) || /rate limit/i.test(message)) {
      throw new ExplorerError(
        "Etherscan rate limit reached. Wait a moment and retry.",
      );
    }
    if (/not verified/i.test(detail)) {
      throw new ExplorerError(
        "This contract is not verified on Etherscan. Import its ABI from a file, paste, or URL instead.",
      );
    }
    throw new ExplorerError(detail);
  }

  try {
    return JSON.parse(result);
  } catch {
    throw new ExplorerError("Etherscan returned an ABI that is not valid JSON.");
  }
}

export async function fetchAbiFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new ExplorerError("Enter a valid URL.");
  }

  const isLocal =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new ExplorerError("ABI URLs must use HTTPS.");
  }

  let response: Response;
  try {
    response = await fetch(parsed, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ExplorerError("The request was cancelled.");
    }
    throw new ExplorerError(
      "Could not fetch that URL. The host may block cross-origin requests.",
    );
  }

  if (!response.ok) {
    throw new ExplorerError(`The URL returned HTTP ${response.status}.`);
  }

  const text = await response.text();
  if (text.length > 5_000_000) {
    throw new ExplorerError("That ABI file is larger than 5 MB.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ExplorerError("The URL did not return valid JSON.");
  }
}

export function explorerName(chainId: number): string {
  return getChain(chainId)?.blockExplorers?.default.name ?? "Explorer";
}
