import {
  getAddress,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { CodeInfo, ProxyInfo } from "@/features/abi/types";

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const EIP1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as Hex;
const EIP1822_IMPLEMENTATION_SLOT =
  "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7" as Hex;

const BEACON_ABI = [
  {
    type: "function",
    name: "implementation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const EIP1167_PATTERN =
  /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/;

function slotAddress(slot: string | undefined): Address | undefined {
  if (!slot || /^0x0+$/.test(slot)) return undefined;
  const raw = slot.replace(/^0x/, "").padStart(64, "0");
  const address = `0x${raw.slice(-40)}`;
  if (/^0x0{40}$/.test(address)) return undefined;
  try {
    return getAddress(address);
  } catch {
    return undefined;
  }
}

async function storageAddress(
  client: PublicClient,
  address: Address,
  slot: Hex,
): Promise<Address | undefined> {
  try {
    const value = await client.getStorageAt({ address, slot });
    return slotAddress(value);
  } catch {
    return undefined;
  }
}

async function detectProxy(
  client: PublicClient,
  address: Address,
  code: Hex,
): Promise<ProxyInfo | undefined> {
  const lower = code.toLowerCase();
  const minimal = EIP1167_PATTERN.exec(lower);
  if (minimal) {
    try {
      return {
        kind: "eip1167",
        implementation: getAddress(`0x${minimal[1]}`),
      };
    } catch {
      return { kind: "eip1167", implementation: `0x${minimal[1]}` };
    }
  }

  const implementation = await storageAddress(
    client,
    address,
    EIP1967_IMPLEMENTATION_SLOT,
  );
  const beacon = await storageAddress(client, address, EIP1967_BEACON_SLOT);
  if (implementation || beacon) {
    return {
      kind: "eip1967",
      implementation,
      beacon,
    };
  }

  const policable = await storageAddress(
    client,
    address,
    EIP1822_IMPLEMENTATION_SLOT,
  );
  if (policable) {
    return { kind: "eip1822", implementation: policable };
  }

  return undefined;
}

export async function inspectContract(
  client: PublicClient,
  address: Address,
  chainId: number,
): Promise<CodeInfo> {
  const code = await client.getCode({ address });
  const safeCode = (code ?? "0x") as Hex;
  const codeSize = Math.max(0, (safeCode.length - 2) / 2);
  let proxy: ProxyInfo | undefined;

  if (codeSize > 0) {
    proxy = await detectProxy(client, address, safeCode);
  }

  return {
    chainId,
    address,
    codeHash: keccak256(safeCode),
    codeSize,
    proxy,
    checkedAt: new Date().toISOString(),
  };
}

export async function resolveBeaconImplementation(
  client: PublicClient,
  beacon: Address,
): Promise<Address | undefined> {
  try {
    return await client.readContract({
      address: beacon,
      abi: BEACON_ABI,
      functionName: "implementation",
    });
  } catch {
    return undefined;
  }
}
