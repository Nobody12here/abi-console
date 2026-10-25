export type ContractTab =
  | "read"
  | "write"
  | "events"
  | "transactions"
  | "abi"
  | "details";

export const CONTRACT_TABS: Array<{ id: ContractTab; label: string }> = [
  { id: "read", label: "Read" },
  { id: "write", label: "Write" },
  { id: "events", label: "Events" },
  { id: "transactions", label: "Transactions" },
  { id: "abi", label: "ABI" },
  { id: "details", label: "Details" },
];
