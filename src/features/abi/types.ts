import type { Abi } from "viem";
import type { Hex } from "viem";

export type AbiSource =
  | { kind: "file"; fileName: string; fileSize?: number }
  | { kind: "paste" }
  | { kind: "url"; url: string }
  | { kind: "explorer"; provider: "etherscan"; verified: true }
  | { kind: "legacy" };

export type AbiCounts = {
  functions: number;
  readFunctions: number;
  writeFunctions: number;
  events: number;
  errors: number;
  constructors: number;
};

export type AbiRevision = {
  id: string;
  hash: Hex;
  raw: unknown[];
  abi: Abi;
  source: AbiSource;
  counts: AbiCounts;
  warnings: string[];
  normalizerVersion: number;
  createdAt: string;
};

export type ProxyInfo =
  | { kind: "eip1167"; implementation: string }
  | { kind: "eip1967"; implementation?: string; beacon?: string }
  | { kind: "eip1822"; implementation?: string }
  | { kind: "beacon"; beacon: string; implementation?: string };

export type CodeInfo = {
  chainId: number;
  address: string;
  codeHash: Hex;
  codeSize: number;
  proxy?: ProxyInfo;
  checkedAt: string;
};

export type ContractBinding = {
  id: string;
  name: string;
  chainId: number;
  address: string;
  activeRevisionId: string;
  revisionIds: string[];
  codeInfo?: CodeInfo;
  lastOpenedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TxStatus =
  | "awaiting-signature"
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "replaced";

export type TxError = {
  message: string;
  decodedName?: string;
  decodedArgs?: unknown[];
};

export type TxRecord = {
  id: string;
  contractId: string;
  chainId: number;
  address: string;
  signature: string;
  selector: string;
  args: unknown[];
  value: string;
  hash?: Hex;
  status: TxStatus;
  blockNumber?: string;
  gasUsed?: string;
  error?: TxError;
  createdAt: string;
  updatedAt: string;
};

export type ThemeMode = "dark" | "light" | "system";

export type Settings = {
  theme: ThemeMode;
  lastChainId?: number;
  rpcOverrides: Record<number, string>;
  etherscanKey: string;
  rememberArgs: boolean;
  confirmValueThresholdWei: string;
};

export type WorkspaceState = {
  version: 2;
  bindings: ContractBinding[];
  revisions: AbiRevision[];
  txs: TxRecord[];
  settings: Settings;
};

export type ImportedAbi = {
  raw: unknown[];
  abi: Abi;
  hash: Hex;
  counts: AbiCounts;
  warnings: string[];
};
