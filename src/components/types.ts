export type AbiInput = { name?: string; type: string };

export type AbiFunction = {
  name: string;
  type: "function";
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
  inputs: AbiInput[];
  outputs?: AbiInput[];
};

export type Result = {
  value: string | boolean;
  formatted?: string;
  loading?: boolean;
};

export type Network = { id: string; name: string; color: string };

export type SavedContract = {
  id: string;
  name: string;
  address: string;
  networkId: number;
  networkName: string;
  abi: AbiFunction[];
  updatedAt: string;
};
