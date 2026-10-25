import type { Abi, Hex } from "viem";
import { decodeErrorResult } from "viem";
import { isHexData } from "@/lib/format";

type ViemLikeError = {
  shortMessage?: string;
  details?: string;
  message?: string;
  data?: unknown;
  cause?: unknown;
  metaMessages?: string[];
  docs?: string;
};

export type DecodedContractError = {
  message: string;
  decodedName?: string;
  decodedArgs?: unknown[];
};

function findRevertData(value: unknown, depth = 0): Hex | undefined {
  if (!value || typeof value !== "object" || depth > 5) return undefined;
  const error = value as ViemLikeError & Record<string, unknown>;

  if (typeof error.data === "string" && isHexData(error.data)) {
    return error.data;
  }
  if (
    error.data &&
    typeof error.data === "object" &&
    "data" in error.data &&
    typeof (error.data as { data?: unknown }).data === "string" &&
    isHexData((error.data as { data: string }).data)
  ) {
    return (error.data as { data: Hex }).data;
  }
  for (const key of ["cause", "error", "info"] as const) {
    const nested = findRevertData(error[key], depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function decodedToString(name: string, args: unknown[] | undefined): string {
  if (!args || args.length === 0) return `${name}()`;
  const rendered = args
    .map((arg) => {
      if (typeof arg === "bigint") return arg.toString();
      if (typeof arg === "string") return JSON.stringify(arg);
      return JSON.stringify(arg, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      );
    })
    .join(", ");
  return `${name}(${rendered})`;
}

export function decodeContractError(
  error: unknown,
  abi: Abi,
): DecodedContractError {
  const revertData = findRevertData(error);
  if (revertData && revertData.length > 2) {
    try {
      const decoded = decodeErrorResult({ abi, data: revertData });
      return {
        message: decodedToString(decoded.errorName, decoded.args as unknown[]),
        decodedName: decoded.errorName,
        decodedArgs: decoded.args as unknown[],
      };
    } catch {
      return {
        message: `Reverted with raw data ${revertData.slice(0, 74)}${revertData.length > 74 ? "…" : ""}.`,
      };
    }
  }

  if (error && typeof error === "object") {
    const typed = error as ViemLikeError;
    const reason =
      typed.shortMessage ??
      typed.details ??
      typed.message ??
      "The contract call failed.";
    const details =
      typed.details && typed.details !== reason ? ` ${typed.details}` : "";
    return { message: `${reason}${details}`.trim() };
  }

  return {
    message:
      typeof error === "string" ? error : "The contract call failed.",
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

export function isUserRejection(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("request rejected")
  );
}

export function isChainMismatch(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("chain mismatch") ||
    message.includes("does not match the target chain") ||
    message.includes("current chain")
  );
}
