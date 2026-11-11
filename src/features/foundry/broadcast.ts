import { getAddress, isAddress, type Address, type Hex } from "viem";
import { mapLimit } from "@/lib/async";
import type { ProjectScan } from "./project";

export type Deployment = {
  address: Address;
  script: string;
  /** Missing for contracts created by raw bytecode or inside another contract. */
  contractName?: string;
  txHash?: Hex;
  /** Milliseconds since the epoch; 0 when unknown. */
  timestamp: number;
  /** Created by another contract (for example a factory), not by the script. */
  nested: boolean;
  /** Position in the broadcast file, to keep deployment order stable. */
  order: number;
};

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Newer Foundry versions may report "src/Vault.sol:Vault".
  const name = value.split(":").pop()?.trim();
  return name || undefined;
}

function toAddress(value: unknown): Address | undefined {
  return typeof value === "string" && isAddress(value, { strict: false })
    ? getAddress(value)
    : undefined;
}

function toMillis(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  // Older Foundry versions wrote seconds.
  return number < 1e12 ? number * 1000 : number;
}

/** Pull every contract creation out of one run-latest.json. */
export function parseBroadcast(json: unknown, script: string): Deployment[] {
  if (!isRecord(json) || !Array.isArray(json.transactions)) return [];
  const timestamp = toMillis(json.timestamp);
  const found: Deployment[] = [];

  const push = (
    address: Address | undefined,
    contractName: string | undefined,
    txHash: unknown,
    nested: boolean,
  ) => {
    if (!address) return;
    found.push({
      address,
      script,
      contractName,
      txHash:
        typeof txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(txHash)
          ? (txHash as Hex)
          : undefined,
      timestamp,
      nested,
      order: found.length,
    });
  };

  for (const tx of json.transactions) {
    if (!isRecord(tx)) continue;
    const type = String(tx.transactionType ?? "").toUpperCase();

    if (type === "CREATE" || type === "CREATE2") {
      push(toAddress(tx.contractAddress), cleanName(tx.contractName), tx.hash, false);
    }
    // Contracts created by a call (factories). Foundry does not name these.
    if (Array.isArray(tx.additionalContracts)) {
      for (const extra of tx.additionalContracts) {
        if (!isRecord(extra)) continue;
        push(toAddress(extra.address), undefined, tx.hash, true);
      }
    }
  }
  return found;
}

/**
 * Combine deployments from several scripts. The same address can appear more
 * than once; the newest record wins, and a name is kept if only an older
 * record had one.
 */
export function mergeDeployments(all: Deployment[]): Deployment[] {
  const byAddress = new Map<string, Deployment>();

  for (const deployment of all) {
    const key = deployment.address.toLowerCase();
    const previous = byAddress.get(key);
    if (!previous) {
      byAddress.set(key, deployment);
      continue;
    }
    const newer =
      deployment.timestamp >= previous.timestamp ? deployment : previous;
    const older = newer === deployment ? previous : deployment;
    byAddress.set(key, {
      ...newer,
      contractName: newer.contractName ?? older.contractName,
    });
  }

  return [...byAddress.values()].sort(
    (a, b) => a.timestamp - b.timestamp || a.order - b.order,
  );
}

export async function readDeployments(
  scan: ProjectScan,
): Promise<{ deployments: Deployment[]; warnings: string[] }> {
  const warnings: string[] = [];

  const lists = await mapLimit(scan.broadcasts, 6, async (broadcast) => {
    try {
      const json = JSON.parse(await broadcast.file.text()) as unknown;
      return parseBroadcast(json, broadcast.script);
    } catch {
      warnings.push(`Could not read the broadcast for ${broadcast.script}.`);
      return [];
    }
  });

  return { deployments: mergeDeployments(lists.flat()), warnings };
}
