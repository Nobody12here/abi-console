import type { Abi, AbiParameter } from "viem";
import { keccak256, stringToHex, type Hex } from "viem";
import { formatAbiItem, parseAbiItem } from "viem/utils";
import type { AbiCounts, ImportedAbi } from "./types";

type RawItem = Record<string, unknown>;
type AbiItem = Abi[number];

const NORMALIZER_VERSION = 1;
const ITEM_TYPES = new Set([
  "function",
  "event",
  "error",
  "constructor",
  "fallback",
  "receive",
]);
const STATE_MUTABILITIES = new Set(["pure", "view", "nonpayable", "payable"]);

export class AbiValidationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? "Invalid ABI");
    this.name = "AbiValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is RawItem {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract the ABI array from a bare ABI, an artifact, or a stringified result. */
export function extractAbi(input: unknown): unknown[] {
  let value = input;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new AbiValidationError(["The pasted value is not valid JSON."]);
    }
  }

  if (Array.isArray(value)) return value;

  if (isRecord(value)) {
    for (const key of ["abi", "interface", "ABI"] as const) {
      const candidate = value[key];
      if (Array.isArray(candidate)) return candidate;
      if (typeof candidate === "string") {
        try {
          const parsed = JSON.parse(candidate);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Fall through to the generic error below.
        }
      }
    }
  }

  throw new AbiValidationError([
    "Expected an ABI JSON array or an artifact with an \"abi\" array.",
  ]);
}

export function splitArrayType(type: string): {
  base: string;
  dimensions: Array<number | null>;
} {
  const dimensions: Array<number | null> = [];
  let base = type.trim();
  const suffix = /^(.*)\[(\d*)\]$/;

  while (true) {
    const match = suffix.exec(base);
    if (!match) break;
    base = match[1];
    dimensions.push(match[2] === "" ? null : Number(match[2]));
  }

  return { base, dimensions };
}

function validateType(type: string, path: string, issues: string[]) {
  if (!type) {
    issues.push(`${path}.type must be a non-empty string.`);
    return;
  }

  const { base, dimensions } = splitArrayType(type);

  for (const size of dimensions) {
    if (size !== null && (!Number.isInteger(size) || size <= 0)) {
      issues.push(`${path}.type has an invalid fixed array size.`);
    }
  }

  if (base === "tuple") return;

  const intMatch = /^(u?)int(\d*)$/.exec(base);
  if (intMatch) {
    if (intMatch[2]) {
      const bits = Number(intMatch[2]);
      if (bits < 8 || bits > 256 || bits % 8 !== 0) {
        issues.push(`${path}.type has an invalid integer width.`);
      }
    }
    return;
  }

  const bytesMatch = /^bytes(\d+)$/.exec(base);
  if (bytesMatch) {
    const size = Number(bytesMatch[1]);
    if (size < 1 || size > 32) {
      issues.push(`${path}.type has an invalid bytes width.`);
    }
    return;
  }

  if (
    !["address", "bool", "string", "bytes", "function"].includes(base)
  ) {
    issues.push(`${path}.type "${type}" is not a supported Solidity ABI type.`);
  }
}

function normalizeParameter(
  input: unknown,
  path: string,
  issues: string[],
  allowIndexed = false,
): AbiParameter | null {
  if (!isRecord(input)) {
    issues.push(`${path} must be an object.`);
    return null;
  }

  const type = typeof input.type === "string" ? input.type.trim() : "";
  if (!type) {
    issues.push(`${path}.type is required.`);
    return null;
  }

  validateType(type, path, issues);
  const { base } = splitArrayType(type);
  const parameter: Record<string, unknown> = { type };

  if (typeof input.name === "string" && input.name.length > 0) {
    parameter.name = input.name;
  }
  if (typeof input.internalType === "string") {
    parameter.internalType = input.internalType;
  }
  if (allowIndexed && typeof input.indexed === "boolean") {
    parameter.indexed = input.indexed;
  }

  if (base === "tuple") {
    if (!Array.isArray(input.components) || input.components.length === 0) {
      issues.push(`${path}.components must be a non-empty array for a tuple.`);
    } else {
      const components = input.components
        .map((component, index) =>
          normalizeParameter(component, `${path}.components[${index}]`, issues),
        )
        .filter((component): component is AbiParameter => component !== null);
      parameter.components = components;
    }
  }

  return parameter as unknown as AbiParameter;
}

function normalizeParameters(
  input: unknown,
  path: string,
  issues: string[],
  allowIndexed = false,
): AbiParameter[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    issues.push(`${path} must be an array.`);
    return null;
  }

  return input
    .map((parameter, index) =>
      normalizeParameter(
        parameter,
        `${path}[${index}]`,
        issues,
        allowIndexed,
      ),
    )
    .filter((parameter): parameter is AbiParameter => parameter !== null);
}

function cleanStateMutability(
  input: RawItem,
  path: string,
  issues: string[],
  allowed: string[],
  fallback: string,
): string {
  if (typeof input.stateMutability === "string") {
    if (!STATE_MUTABILITIES.has(input.stateMutability)) {
      issues.push(`${path}.stateMutability is invalid.`);
      return fallback;
    }
    if (!allowed.includes(input.stateMutability)) {
      issues.push(`${path}.stateMutability must be one of ${allowed.join(", ")}.`);
      return fallback;
    }
    return input.stateMutability;
  }

  if (input.constant === true && allowed.includes("view")) return "view";
  if (input.payable === true && allowed.includes("payable")) return "payable";
  return fallback;
}

function prepareItem(
  input: unknown,
  index: number,
  issues: string[],
  warnings: string[],
): AbiItem | null {
  const path = `abi[${index}]`;
  if (!isRecord(input)) {
    issues.push(`${path} must be an object.`);
    return null;
  }

  let type = typeof input.type === "string" ? input.type : "";
  if (!type && typeof input.name === "string" && Array.isArray(input.inputs)) {
    type = "function";
    warnings.push(`${path} had no type; treated it as a function.`);
  }

  if (!ITEM_TYPES.has(type)) {
    issues.push(
      `${path}.type "${type || "(missing)"}" is not one of function, event, error, constructor, fallback, or receive.`,
    );
    return null;
  }

  if (type === "function" || type === "event" || type === "error") {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      issues.push(`${path}.name is required for ${type} entries.`);
      return null;
    }
  }

  if (type === "function") {
    const inputs = normalizeParameters(input.inputs, `${path}.inputs`, issues);
    const outputs = normalizeParameters(
      input.outputs,
      `${path}.outputs`,
      issues,
    );
    if (inputs === null || outputs === null) return null;
    return {
      type: "function",
      name: input.name as string,
      stateMutability: cleanStateMutability(
        input,
        path,
        issues,
        ["pure", "view", "nonpayable", "payable"],
        "nonpayable",
      ),
      inputs,
      outputs,
    } as AbiItem;
  }

  if (type === "event") {
    const inputs = normalizeParameters(
      input.inputs,
      `${path}.inputs`,
      issues,
      true,
    );
    if (inputs === null) return null;
    return {
      type: "event",
      name: input.name as string,
      inputs,
      anonymous: input.anonymous === true,
    } as AbiItem;
  }

  if (type === "error") {
    const inputs = normalizeParameters(input.inputs, `${path}.inputs`, issues);
    if (inputs === null) return null;
    return {
      type: "error",
      name: input.name as string,
      inputs,
    } as AbiItem;
  }

  if (type === "constructor") {
    const inputs = normalizeParameters(input.inputs, `${path}.inputs`, issues);
    if (inputs === null) return null;
    return {
      type: "constructor",
      stateMutability: cleanStateMutability(
        input,
        path,
        issues,
        ["nonpayable", "payable"],
        "nonpayable",
      ),
      inputs,
    } as AbiItem;
  }

  return {
    type,
    stateMutability: cleanStateMutability(
      input,
      path,
      issues,
      ["nonpayable", "payable"],
      "nonpayable",
    ),
  } as AbiItem;
}

function validateItem(item: AbiItem, index: number, issues: string[]) {
  if (!["function", "event", "error"].includes(item.type)) return;

  try {
    const signature = formatAbiItem(item);
    parseAbiItem(`${item.type} ${signature}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`abi[${index}] is not a valid ${item.type}: ${message}`);
  }
}

function itemIdentity(item: AbiItem): string {
  if (item.type === "function" || item.type === "event" || item.type === "error") {
    return `${item.type}:${formatAbiItem(item)}`;
  }
  return item.type;
}

export function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalStringify(record[key])}`,
      )
      .join(",")}}`;
  }

  if (typeof value === "bigint") return JSON.stringify(value.toString());
  return JSON.stringify(value) ?? "null";
}

export function hashAbi(raw: unknown[]): Hex {
  return keccak256(stringToHex(canonicalStringify(raw)));
}

export function countAbi(abi: Abi): AbiCounts {
  const functions = abi.filter(
    (item): item is Extract<AbiItem, { type: "function" }> =>
      item.type === "function",
  );
  return {
    functions: functions.length,
    readFunctions: functions.filter(
      (item) =>
        item.stateMutability === "view" || item.stateMutability === "pure",
    ).length,
    writeFunctions: functions.filter(
      (item) =>
        item.stateMutability === "nonpayable" ||
        item.stateMutability === "payable",
    ).length,
    events: abi.filter((item) => item.type === "event").length,
    errors: abi.filter((item) => item.type === "error").length,
    constructors: abi.filter((item) => item.type === "constructor").length,
  };
}

export function normalizeAbi(input: unknown): ImportedAbi {
  const raw = extractAbi(input);
  if (raw.length === 0) {
    throw new AbiValidationError(["The ABI is empty."]);
  }

  const issues: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const items: AbiItem[] = [];

  raw.forEach((entry, index) => {
    const item = prepareItem(entry, index, issues, warnings);
    if (!item) return;

    const issueCount = issues.length;
    validateItem(item, index, issues);
    if (issues.length > issueCount) return;

    const identity = itemIdentity(item);
    if (seen.has(identity)) {
      warnings.push(`Duplicate ${identity} was skipped.`);
      return;
    }
    seen.add(identity);
    items.push(item);
  });

  if (issues.length > 0) {
    throw new AbiValidationError(issues);
  }

  if (items.length === 0) {
    throw new AbiValidationError(["The ABI does not contain any usable items."]);
  }

  const abi = items as Abi;
  return {
    raw,
    abi,
    hash: hashAbi(raw),
    counts: countAbi(abi),
    warnings,
  };
}

export { NORMALIZER_VERSION };
