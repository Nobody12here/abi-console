import type { Abi, AbiEvent, AbiFunction, AbiParameter } from "viem";
import { toFunctionSelector, type Hex } from "viem";
import { formatAbiItem, getFunctionSignature } from "viem/utils";

export type AbiFunctionItem = Extract<Abi[number], { type: "function" }>;
export type AbiEventItem = Extract<Abi[number], { type: "event" }>;
export type AbiErrorItem = Extract<Abi[number], { type: "error" }>;

export function abiFunctions(abi: Abi): AbiFunctionItem[] {
  return abi.filter(
    (item): item is AbiFunctionItem => item.type === "function",
  );
}

export function abiReadFunctions(abi: Abi): AbiFunctionItem[] {
  return abiFunctions(abi).filter(
    (item) =>
      item.stateMutability === "view" || item.stateMutability === "pure",
  );
}

export function abiWriteFunctions(abi: Abi): AbiFunctionItem[] {
  return abiFunctions(abi).filter(
    (item) =>
      item.stateMutability === "nonpayable" ||
      item.stateMutability === "payable",
  );
}

export function abiEvents(abi: Abi): AbiEventItem[] {
  return abi.filter(
    (item): item is AbiEventItem => item.type === "event",
  );
}

export function abiErrors(abi: Abi): AbiErrorItem[] {
  return abi.filter(
    (item): item is AbiErrorItem => item.type === "error",
  );
}

export function functionSignature(fn: AbiFunction): string {
  return getFunctionSignature(fn);
}

export function functionSelector(fn: AbiFunction): Hex {
  return toFunctionSelector(fn);
}

export function itemSignature(item: Abi[number]): string {
  if (
    item.type === "function" ||
    item.type === "event" ||
    item.type === "error"
  ) {
    return formatAbiItem(item);
  }
  return item.type;
}

export function itemLabel(item: Abi[number]): string {
  if (
    item.type === "function" ||
    item.type === "event" ||
    item.type === "error"
  ) {
    return item.name;
  }
  return item.type;
}

export function parameterComponents(
  parameter: AbiParameter,
): readonly AbiParameter[] {
  if ("components" in parameter && Array.isArray(parameter.components)) {
    return parameter.components as readonly AbiParameter[];
  }
  return [];
}

export function canonicalParameterType(parameter: AbiParameter): string {
  const base = parameter.type.replace(/\[[0-9]*\]/g, "");
  if (base === "tuple") {
    const components = parameterComponents(parameter)
      .map((component) => canonicalParameterType(component))
      .join(",");
    const suffix = parameter.type.match(/(\[[0-9]*\])+$/)?.[0] ?? "";
    return `(${components})${suffix}`;
  }
  return parameter.type;
}

export function formatParameterType(parameter: AbiParameter): string {
  return canonicalParameterType(parameter);
}

export function formatInputLabel(
  input: AbiParameter,
  index: number,
): string {
  return input.name?.trim() ? input.name : `arg${index}`;
}

export function outputSummary(fn: AbiFunction): string {
  const outputs = fn.outputs ?? [];
  if (outputs.length === 0) return "no return";
  if (outputs.length === 1) {
    return outputs[0].type;
  }
  return `${outputs.length} returns`;
}

export function searchFunction(fn: AbiFunction, query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  const signature = functionSignature(fn).toLowerCase();
  const selector = functionSelector(fn).toLowerCase();
  return (
    fn.name.toLowerCase().includes(needle) ||
    signature.includes(needle) ||
    selector.includes(needle)
  );
}

export function proxyLabel(proxy: NonNullable<unknown> | undefined): string {
  if (!proxy || typeof proxy !== "object") return "None detected";
  const kind = (proxy as { kind?: string }).kind;
  switch (kind) {
    case "eip1167":
      return "EIP-1167 minimal proxy";
    case "eip1967":
      return "EIP-1967 proxy";
    case "eip1822":
      return "EIP-1822 proxy";
    case "beacon":
      return "EIP-1967 beacon proxy";
    default:
      return "Proxy detected";
  }
}

export function eventInputs(event: AbiEvent): string {
  return (event.inputs ?? [])
    .map((input) => `${input.type}${input.indexed ? " indexed" : ""}`)
    .join(", ");
}
